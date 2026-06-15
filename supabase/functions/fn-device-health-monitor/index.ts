import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, requireInternalAccess, safeErrorMessage, sha256 } from "../_shared/core.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { captureException } from "../_shared/sentry.ts";

const TWELVE_H = 12;
const TWENTY_FOUR_H = 24;
const FORTY_EIGHT_H = 48;

interface TelemetryPostBody {
  device_session_id: string;
  nonce: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();

  // ─── 1. ACTIVE SIGNED DEVICE TELEMETRY INGESTION PATH (POST) ───
  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req) as Record<string, unknown>;
      const input = body as unknown as TelemetryPostBody;

      if (!input.device_session_id || !input.nonce || !input.timestamp || !input.payload) {
        throw new Error("400: Malformed telemetry request body");
      }

      const signature = req.headers.get("x-haven-device-signature");
      const db = admin();

      // Closure Test 1: Unsigned telemetry -> 403
      if (!signature) {
        await db.from("security_violations").insert({
          error_code: "403_UNSIGNED",
          table_name: "device_health_telemetry",
          attempted_action: "POST_TELEMETRY",
          attempted_sql: "Ingestion without x-haven-device-signature",
          violation_reason: "Device telemetry requests must provide verified cryptographic HMAC attestation proof",
        });
        throw new Error("403_UNSIGNED: Missing cryptographic hardware device attestation signature");
      }

      // Closure Test 5: Spam burst -> rate limit triggers + security log entry
      try {
        await rateLimit(req, `telemetry_burst_${input.device_session_id}`, 10, 60);
      } catch (rateErr) {
        await db.from("security_violations").insert({
          error_code: "429_SPAM_BURST",
          actor_id: input.device_session_id,
          table_name: "device_health_telemetry",
          attempted_action: "POST_TELEMETRY",
          attempted_sql: `Burst ingestion exceeding 10 requests / minute for device ${input.device_session_id}`,
          violation_reason: "High-frequency spam burst anomaly detected from edge endpoint",
        });
        const err = new Error("429_SPAM_BURST: Too many telemetry requests triggered rate control");
        (err as unknown as { status: number }).status = 429;
        throw err;
      }

      // Closure Test 4: Revoked device_session -> reject telemetry
      const { data: session } = await db
        .from("device_sessions")
        .select("id, profile_id, device_secret, revoked_at")
        .eq("id", input.device_session_id)
        .maybeSingle();

      if (!session) {
        throw new Error("403_SESSION_ERR: Hardware session non-existent");
      }
      if (session.revoked_at !== null) {
        throw new Error("403_REVOKED: Device session has been soft-revoked; active telemetry rejected");
      }

      // Closure Test 3: Replay same nonce -> 403
      const { data: existingNonce } = await db
        .from("device_telemetry_nonces")
        .select("nonce")
        .eq("nonce", input.nonce)
        .maybeSingle();

      if (existingNonce) {
        await db.from("security_violations").insert({
          error_code: "403_REPLAY_ATTACK",
          actor_id: input.device_session_id,
          table_name: "device_telemetry_nonces",
          attempted_action: "POST_TELEMETRY",
          attempted_sql: `Replay of already captured nonce ${input.nonce}`,
          violation_reason: "Replay protection validation halted execution; identical nonce cannot be reused",
        });
        throw new Error("403_REPLAY_ATTACK: Telemetry Replay attack detected");
      }

      // Verify temporal window (+/- 5 minutes)
      const reqTime = new Date(input.timestamp).getTime();
      if (Math.abs(Date.now() - reqTime) > 300_000) {
        throw new Error("403_STALE: Timestamp outside allowed +/- 5 minute execution drift");
      }

      // Closure Test 2: Bad signature -> 403
      const payloadString = typeof input.payload === "string" ? input.payload : JSON.stringify(input.payload);
      const expectedRaw = `${input.device_session_id}:${input.nonce}:${input.timestamp}:${payloadString}`;
      const expectedSig = await sha256(`${expectedRaw}:${session.device_secret}`);

      if (signature !== expectedSig) {
        await db.from("security_violations").insert({
          error_code: "403_BAD_SIGNATURE",
          actor_id: input.device_session_id,
          table_name: "device_health_telemetry",
          attempted_action: "POST_TELEMETRY",
          attempted_sql: `HMAC verification failed for payload hash ${await sha256(payloadString)}`,
          violation_reason: "Cryptographic HMAC device attestation signature mismatch",
        });
        throw new Error("403_BAD_SIGNATURE: Invalid hardware device signature");
      }

      // Store nonces for replay rejection with a 15-minute TTL
      const nonceExp = new Date(Date.now() + 900_000).toISOString();
      await db.from("device_telemetry_nonces").insert({
        nonce: input.nonce,
        device_session_id: input.device_session_id,
        expires_at: nonceExp,
      });

      // Flawlessly update operational session status
      await db.from("device_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", input.device_session_id);

      await recordMetric("fn-device-health-monitor", started, "success");
      return json({ ok: true, status: "telemetry_verified", device_session_id: session.id }, 200, req);
    } catch (error) {
      const errStr = String((error as Error).message ?? error);
      let statusCode = (error as { status?: number }).status ?? 403;
      if (errStr.includes("400")) statusCode = 400;

      await recordMetric("fn-device-health-monitor", started, "error");
      return json({ error: errStr }, statusCode, req);
    }
  }

  // ─── 2. PRE-EXISTING INTERNAL SCHEDULED CRON SWEEP (GET / Sweep) ───
  try {
    requireInternalAccess(req);
    const db = admin();
    const now = Date.now();

    const { data: elders } = await db.from("profiles")
      .select("id, preferred_name, full_name")
      .eq("role", "elder")
      .is("deleted_at", null);

    const eventsWritten: string[] = [];
    const familyNotified: string[] = [];
    const escalations: string[] = [];

    for (const elder of elders ?? []) {
      const { data: session } = await db.from("device_sessions")
        .select("id, last_seen_at, platform")
        .eq("profile_id", elder.id)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!session) {
        const { data: ev } = await db.from("device_health_events").insert({
          profile_id: elder.id,
          severity: "warn",
          event_key: "no_heartbeat_12h",
          message_nl: "HAVEN heeft nog geen hartslag ontvangen.",
          message_en: "HAVEN has not received a heartbeat yet.",
          details: { reason: "no_session_recorded" },
        }).select("id").single();
        if (ev) eventsWritten.push(ev.id);
        continue;
      }

      const ageMs = now - new Date(session.last_seen_at).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      if (ageHours >= FORTY_EIGHT_H) {
        const { data: ev } = await db.from("device_health_events").insert({
          profile_id: elder.id,
          device_session_id: session.id,
          severity: "p0",
          event_key: "no_heartbeat_48h",
          message_nl: "HAVEN heeft al twee dagen geen contact gehad met de telefoon.",
          message_en: "HAVEN has not heard from the phone in 2 days.",
          details: { last_seen_at: session.last_seen_at, age_hours: Math.round(ageHours) },
        }).select("id").single();
        if (ev) eventsWritten.push(ev.id);

        const { data: family } = await db.from("family_relationships")
          .select("family_member_id").eq("elder_id", elder.id).eq("elder_consented", true).eq("is_active", true).eq("notify_on_crisis", true);
        for (const f of family ?? []) {
          await dispatchNotification({
            recipient_id: f.family_member_id,
            elder_id: elder.id,
            notification_type: "welzijnscheck",
            title_nl: "HAVEN heeft al twee dagen geen contact",
            title_en: "HAVEN has been offline for 2 days",
            body_nl: "Het kan zijn dat de telefoon uit staat, of dat er iets is veranderd in de rechten. Wilt u even langsgaan?",
            body_en: "The phone may be off, or permissions may have changed. Could you check in?",
            data: { device_session_id: session.id, severity: "p0" },
          });
        }
        escalations.push(elder.id);
        familyNotified.push(...(family ?? []).map((f) => f.family_member_id));
        continue;
      }

      if (ageHours >= TWENTY_FOUR_H) {
        const { data: ev } = await db.from("device_health_events").insert({
          profile_id: elder.id,
          device_session_id: session.id,
          severity: "p1",
          event_key: "no_heartbeat_24h",
          message_nl: "HAVEN heeft vandaag geen contact gehad met de telefoon.",
          message_en: "HAVEN has not heard from the phone today.",
          details: { last_seen_at: session.last_seen_at, age_hours: Math.round(ageHours) },
        }).select("id").single();
        if (ev) eventsWritten.push(ev.id);

        const { data: family } = await db.from("family_relationships")
          .select("family_member_id").eq("elder_id", elder.id).eq("elder_consented", true).eq("is_active", true);
        for (const f of family ?? []) {
          await dispatchNotification({
            recipient_id: f.family_member_id,
            elder_id: elder.id,
            notification_type: "welzijnscheck",
            title_nl: "HAVEN heeft vandaag niet gecheckt",
            title_en: "HAVEN hasn't checked in today",
            body_nl: "Het kan zijn dat de telefoon uit staat of dat er iets is veranderd in de rechten. Een belletje kan geen kwaad.",
            body_en: "The phone may be off or permissions changed. A quick call is a good idea.",
            data: { device_session_id: session.id, severity: "p1" },
          });
        }
        familyNotified.push(...(family ?? []).map((f) => f.family_member_id));
        continue;
      }

      if (ageHours >= TWELVE_H) {
        const { data: ev } = await db.from("device_health_events").insert({
          profile_id: elder.id,
          device_session_id: session.id,
          severity: "warn",
          event_key: "no_heartbeat_12h",
          message_nl: "HAVEN heeft al meer dan 12 uur niet gecheckt bij de telefoon.",
          message_en: "HAVEN hasn't checked in for over 12 hours.",
          details: { last_seen_at: session.last_seen_at, age_hours: Math.round(ageHours) },
        }).select("id").single();
        if (ev) eventsWritten.push(ev.id);
      }
    }

    await recordMetric("fn-device-health-monitor", started, "success");
    return json({ ok: true, events_written: eventsWritten.length, family_notified: familyNotified.length, escalations: escalations.length });
  } catch (e) {
    await recordMetric("fn-device-health-monitor", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
