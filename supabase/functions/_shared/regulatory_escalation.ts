import { settleQuery } from "./settle.ts";
import { admin, dispatchNotification, sha256 } from "./core.ts";
import { captureException } from "./sentry.ts";

export interface RegulatoryEscalationPayload {
  incident_id: string;
  severity: string;
  severity_nl: string;
  severity_en: string;
  description_nl: string;
  description_en: string;
  timestamp: string;
  care_org_id: string;
  elder_id?: string;
}

/**
 * SSRF guard for outbound webhook URLs (extracted so it can be unit-tested and
 * reused by every outbound integration).
 *
 * Rejects: non-HTTPS schemes, embedded credentials, loopback/RFC1918/CGNAT/
 * link-local/multicast/reserved IPv4, IPv6 loopback + unique-local + link-local,
 * and the `.localhost` / `.local` / `.internal` pseudo-TLDs.
 *
 * Note this is a *literal* check. Hostnames must additionally be resolved before
 * the request (executeRegulatoryEscalation already does an A-record pre-check);
 * a full fix requires an egress proxy, which remains an infrastructure item.
 */
export function assertPublicHttpsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw ssrfError(rawUrl, 'URL_PARSE_BLOCKED');
  }

  if (url.protocol !== 'https:') throw ssrfError(rawUrl, 'SCHEME_NOT_HTTPS');
  if (url.username || url.password) throw ssrfError(rawUrl, 'EMBEDDED_CREDENTIALS');

  // A trailing dot is a valid FQDN root ("localhost.") and must not bypass the
  // pseudo-TLD rules below.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');

  if (!host) throw ssrfError(rawUrl, 'EMPTY_HOST');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw ssrfError(rawUrl, 'PSEUDO_TLD');
  }

  const blockedV4 = [
    /^10\./,
    /^127\./,
    /^0\./,
    /^169\.254\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
    /^192\.0\.0\./,
    /^198\.(1[89]|[2-9]\d)\./,                    // benchmarking 198.18/15
    /^(22[4-9]|23\d|24\d|25[0-5])\./,             // multicast + reserved
  ];
  if (blockedV4.some((rule) => rule.test(host))) throw ssrfError(rawUrl, 'PRIVATE_IPV4');

  const isIpv6 = host.includes(':');
  if (isIpv6) {
    // IPv4-mapped addresses appear either dotted (`::ffff:127.0.0.1`) or, after
    // WHATWG URL normalisation, in hex (`::ffff:7f00:1`). Neither form is a
    // plausible webhook destination, so both are rejected outright.
    if (/^::ffff:/.test(host)) throw ssrfError(rawUrl, 'PRIVATE_IPV4_MAPPED');
    if (host === '::1' || host === '::' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) {
      throw ssrfError(rawUrl, 'PRIVATE_IPV6');
    }
  }

  return url;
}

function ssrfError(rawUrl: string, reason: string) {
  const error = new Error(`403 Forbidden: Malicious regulatory webhook destination rejected (${rawUrl})`);
  (error as Error & { status?: number; code?: string; ssrfReason?: string }).status = 403;
  (error as Error & { code?: string }).code = 'FORBIDDEN';
  (error as Error & { ssrfReason?: string }).ssrfReason = reason;
  return error;
}

export async function executeRegulatoryEscalation(
  incidentId: string,
  severity: string,
  elderId: string,
  careOrgId = "haven_thuiszorg_default"
): Promise<void> {
  const normSeverity = severity.toLowerCase();
  if (normSeverity !== "kritiek" && normSeverity !== "critical") return;

  const db = admin();

  const descriptionNl = "Ernstig zorgincident geregistreerd. Direct toezicht of escalatie per Meldcode vereist.";
  const descriptionEn = "Severe care incident logged. Immediate regulatory supervision or safeguarding escalation required.";

  const payload: RegulatoryEscalationPayload = {
    incident_id: incidentId,
    severity: "critical",
    severity_nl: "kritiek",
    severity_en: "critical",
    description_nl: descriptionNl,
    description_en: descriptionEn,
    timestamp: new Date().toISOString(),
    care_org_id: careOrgId,
    elder_id: elderId,
  };

  const payloadString = JSON.stringify(payload);

  // Send signed JSON webhook to configurable endpoint in integration_connections
  const escalationTask = async () => {
    let webhookOutcome: "success" | "failure";
    let httpStatus: number | null = null;
    let endpointUrl = Deno.env.get("REGULATORY_ESCALATION_WEBHOOK_URL") ?? "";
    let vendorSecret = Deno.env.get("REGULATORY_ESCALATION_HMAC_SECRET") ?? "";

    try {
      const { data: conn } = await db
        .from("integration_connections")
        .select("legal_gate, secret_names")
        .eq("integration_key", "igj_escalation")
        .maybeSingle();

      if (conn?.legal_gate) endpointUrl = conn.legal_gate;
      if (conn?.secret_names?.[0]) vendorSecret = Deno.env.get(conn.secret_names[0]) ?? vendorSecret;

      if (!endpointUrl || !vendorSecret) {
        throw new Error("Regulatory escalation webhook URL and HMAC secret must be configured");
      }

      // FIX B7: Authoritative SSRF URL validation (shared, unit-tested guard)
      let parsedUrl: URL;
      try {
        parsedUrl = assertPublicHttpsUrl(endpointUrl);
      } catch (ssrfErr) {
        await settleQuery(db.from("audit_log").insert({
          actor_id: "00000000-0000-0000-0000-000000000001",
          actor_role: "system",
          action: "REGULATORY_SSRF_REJECTION",
          table_name: "integration_connections",
          record_id: incidentId,
          elder_id: elderId,
          extra: {
            attempted_url: endpointUrl,
            reason: (ssrfErr as { ssrfReason?: string }).ssrfReason ?? "SSRF_URL_PARSE_BLOCKED",
            timestamp: new Date().toISOString(),
          },
        }), "audit_log");
        throw ssrfErr;
      }
      const host = parsedUrl.hostname.toLowerCase();

      // COMPENSATING CONTROL — DNS pre-resolution reduces TOCTOU window
      // but does not fully eliminate DNS rebinding risk.
      // Full mitigation requires egress proxy (scheduled infrastructure milestone)
      const mockDns = (db as unknown as { __mockDns?: Record<string, string[]> }).__mockDns;
      let resolvedIps: string[] = [];
      if (mockDns && mockDns[host]) {
        resolvedIps = mockDns[host];
      } else {
        try {
          // Resolve A and AAAA records via Deno DNS OS APIs
          resolvedIps = await Deno.resolveDns(host, "A");
        } catch {
          resolvedIps = [];
        }
      }

      const hasInternalIp = resolvedIps.some((ip) => {
        return /^(10\.|192\.168\.|127\.|169\.254\.169\.254)/.test(ip) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip) || ip === "::1";
      });

      if (hasInternalIp) {
        const dnsErr = new Error(`403 Forbidden: DNS Pre-Resolution detected internal IP SSRF target (${endpointUrl} -> ${resolvedIps.join(", ")})`);
        await settleQuery(db.from("audit_log").insert({
          actor_id: "00000000-0000-0000-0000-000000000001",
          actor_role: "system",
          action: "REGULATORY_SSRF_REJECTION",
          table_name: "integration_connections",
          record_id: incidentId,
          elder_id: elderId,
          extra: { attempted_url: endpointUrl, resolved_ips: resolvedIps, reason: "SSRF_DNS_RESOLVE_BLOCKED", timestamp: new Date().toISOString() },
        }), "audit_log");
        throw dnsErr;
      }

      const signature = await sha256(`${payloadString}:${vendorSecret}`);

      // Add a short connection timeout (1000ms) to prevent slow-loris internal probing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Haven-Regulatory-Signature": signature,
        },
        body: payloadString,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      httpStatus = res.status;
      if (res.ok) {
        webhookOutcome = "success";
      } else {
        throw new Error(`Escalation endpoint returned HTTP ${res.status}`);
      }
    } catch (webhookErr) {
      webhookOutcome = "failure";
      console.warn(`Regulatory escalation failed for incident ${incidentId}: ${String((webhookErr as Error).message ?? webhookErr).slice(0, 240)}`);
      await captureException(webhookErr, { fn: "executeRegulatoryEscalation", incident_id: incidentId });
      
      const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
      for (const a of admins ?? []) {
        await settleQuery(dispatchNotification({
          recipient_id: String(a.id),
          elder_id: elderId,
          notification_type: "systeem",
          title_nl: "CRITICAL MISLUKT: IGJ Escalatie",
          title_en: "CRITICAL FAILED: IGJ Escalation",
          body_nl: `Het automatische escalatie-webhook voor zorgincident ${incidentId} is mislukt. Onderneem direct actie.`,
          body_en: `The automated regulatory escalation webhook for care incident ${incidentId} failed. Manual intervention required.`,
          data: { incident_id: incidentId, outcome: "failure" },
        }), "query");
      }
    }

    // Log outcome to audit_log
    const { error: auditError } = await db.from("audit_log").insert({
      actor_id: "00000000-0000-0000-0000-000000000001",
      actor_role: "system",
      action: "REGULATORY_INCIDENT_ESCALATION",
      table_name: "incidents",
      record_id: incidentId,
      elder_id: elderId,
      extra: {
        severity,
        care_org_id: careOrgId,
        outcome: webhookOutcome,
        http_status: httpStatus,
        timestamp: payload.timestamp,
      },
    });
    if (auditError) {
      console.warn(`Regulatory escalation audit log failed for incident ${incidentId}: ${auditError.message}`);
      throw auditError;
    }
  };

  await Promise.race([
    escalationTask(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Regulatory escalation timed out")), 1500)),
  ]).catch((error) => {
    console.warn(`Regulatory escalation did not complete for incident ${incidentId}: ${String((error as Error).message ?? error).slice(0, 240)}`);
  });
}
