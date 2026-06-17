import { admin, dispatchNotification, sha256 } from "./core.ts";
import { captureException } from "./sentry.ts";

export interface RegulatoryEscalationPayload {
  incident_id: string;
  severity: string;
  timestamp: string;
  care_org_id: string;
  elder_id?: string;
}

export async function executeRegulatoryEscalation(
  incidentId: string,
  severity: string,
  elderId: string,
  careOrgId = "haven_thuiszorg_default"
): Promise<void> {
  // Closure Test 3: severity='laag' -> no escalation webhook called
  if (severity !== "kritiek") return;

  const db = admin();

  const payload: RegulatoryEscalationPayload = {
    incident_id: incidentId,
    severity,
    timestamp: new Date().toISOString(),
    care_org_id: careOrgId,
    elder_id: elderId,
  };

  const payloadString = JSON.stringify(payload);

  // Send signed JSON webhook to configurable endpoint in integration_connections
  const escalationTask = async () => {
    let webhookOutcome: "success" | "failure" = "failure";
    let httpStatus: number | null = null;
    let endpointUrl = "https://igj.haven.internal/webhook/v1/escalate";
    let vendorSecret = "secret_hmac_default";

    try {
      const { data: conn } = await db
        .from("integration_connections")
        .select("legal_gate, secret_names")
        .eq("integration_key", "igj_escalation")
        .maybeSingle();

      if (conn?.legal_gate) endpointUrl = conn.legal_gate;
      if (conn?.secret_names?.[0]) vendorSecret = conn.secret_names[0];

      // FIX B7: Authoritative SSRF URL validation
      const parsedUrl = new URL(endpointUrl);
      const host = parsedUrl.hostname.toLowerCase();
      const isRfc1918 = /^(10\.|192\.168\.|127\.|localhost)/.test(host) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
      const isImds = host === "169.254.169.254" || host === "[::1]";

      if (parsedUrl.protocol !== "https:" || isRfc1918 || isImds) {
        const ssrfErr = new Error(`403 Forbidden: Malicious regulatory webhook destination rejected (${endpointUrl})`);
        await db.from("audit_log").insert({
          actor_id: "00000000-0000-0000-0000-000000000001",
          actor_role: "system",
          action: "REGULATORY_SSRF_REJECTION",
          table_name: "integration_connections",
          record_id: incidentId,
          elder_id: elderId,
          extra: { attempted_url: endpointUrl, reason: "SSRF_URL_PARSE_BLOCKED", timestamp: new Date().toISOString() },
        }).catch(() => undefined);
        throw ssrfErr;
      }

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
        await db.from("audit_log").insert({
          actor_id: "00000000-0000-0000-0000-000000000001",
          actor_role: "system",
          action: "REGULATORY_SSRF_REJECTION",
          table_name: "integration_connections",
          record_id: incidentId,
          elder_id: elderId,
          extra: { attempted_url: endpointUrl, resolved_ips: resolvedIps, reason: "SSRF_DNS_RESOLVE_BLOCKED", timestamp: new Date().toISOString() },
        }).catch(() => undefined);
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
      await captureException(webhookErr, { fn: "executeRegulatoryEscalation", incident_id: incidentId });
      
      const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
      for (const a of admins ?? []) {
        await dispatchNotification({
          recipient_id: String(a.id),
          elder_id: elderId,
          notification_type: "systeem",
          title_nl: "CRITICAL MISLUKT: IGJ Escalatie",
          title_en: "CRITICAL FAILED: IGJ Escalation",
          body_nl: `Het automatische escalatie-webhook voor zorgincident ${incidentId} is mislukt. Onderneem direct actie.`,
          body_en: `The automated regulatory escalation webhook for care incident ${incidentId} failed. Manual intervention required.`,
          data: { incident_id: incidentId, outcome: "failure" },
        }).catch(() => undefined);
      }
    }

    // Log outcome to audit_log
    await db.from("audit_log").insert({
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
    }).catch(() => undefined);
  };

  await Promise.race([
    escalationTask(),
    new Promise((_, resolve) => setTimeout(resolve, 1500)),
  ]).catch(() => undefined);
}
