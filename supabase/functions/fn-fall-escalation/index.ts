import { settleQuery } from "../_shared/settle.ts";
import { admin, corsHeaders, dispatchNotification, json } from "../_shared/core.ts";
import { captureException } from "../_shared/sentry.ts";
import { asyncWrapper } from "../_shared/async_wrapper.ts";
import { requireInternalAccess } from "../_shared/internal.ts";

const PRECISE_LOCATION_TTL = 1800; // 30 minutes signed GPS exposure window

interface EmergencyFallRow {
  fall_id: string;
  elder_id: string;
  detection_source: string;
  confidence: number;
  status: string;
  detected_at: string;
  device_label: string | null;
  device_platform: string | null;
}

interface LocationEventRow {
  id: string;
  precise_longitude: number;
  precise_latitude: number;
  accuracy_metres: number | null;
  recorded_at: string;
}

Deno.serve(asyncWrapper("fn-fall-escalation", async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  
  // 1. Highly secure internal scheduled cron access check
  requireInternalAccess(req);

  // ─── 2. Basic Monitoring / Rate Limit Guard for Spike Alerting ───
  // Confirms spikes in emergency-location object creation do not exceed time budgets.
  // Trigger spike alert when creations exceed threshold.
  const { rateLimit } = await import("../_shared/ratelimit.ts");
  try {
    await rateLimit(req, "s3_emergency_location_creations");
  } catch (rateErr) {
    const dbAdmin = admin();
    await settleQuery(dbAdmin.from("security_violations").insert({
      error_code: "429_OBJECT_SPIKE",
      table_name: "tts-cache",
      attempted_action: "UPLOAD_EMERGENCY_LOCATION",
      attempted_sql: "Object creation spike threshold exceeded",
      violation_reason: "Basic monitoring and rate control triggered to prevent S3 bucket cache explosion and billing DoS",
    }), "security_violations");
    
    await captureException(new Error("S3 Object Creation Spike Threshold Exceeded"), { fn: "fn-fall-escalation", context: "s3_creation_spike" });
    const spikeErr = new Error("429_OBJECT_SPIKE: Emergency location object creation spike threshold exceeded");
    (spikeErr as unknown as { status: number }).status = 429;
    throw spikeErr;
  }

  const db = admin();
  const { data: activeFalls, error: fallErr } = await db.rpc("get_active_emergency_falls");

  if (fallErr) throw fallErr;

  const fallsToProcess = (activeFalls as EmergencyFallRow[] ?? []).slice(0, 50);
  const familyNotified: string[] = [];
  const failed: string[] = [];

  // 3. Multi-Patient / Per-Recipient Worker Isolation Loop
  await Promise.allSettled(fallsToProcess.map(async (ev) => {
    let claimTime: string | null = null;
    try {
      // Conditional claim: only the status from the RPC snapshot can be claimed. Recovery
      // of a processing claim additionally requires an expired lease at UPDATE time.
      const claimedAt = new Date().toISOString();
      let claimQuery = db.from("fall_events")
        .update({ status: "processing", escalation_claimed_at: claimedAt })
        .eq("id", ev.fall_id)
        .eq("status", ev.status);
      if (ev.status === "processing") {
        claimQuery = claimQuery.lt("escalation_claimed_at", new Date(Date.now() - 5 * 60_000).toISOString());
      }
      const { data: claimed, error: claimErr } = await claimQuery.select().maybeSingle();
      if (claimErr) throw claimErr;
      if (!claimed) return;
      claimTime = claimedAt;

      // FIX A3: When claiming a 'processing' row that was stale, log a 'STALE_CLAIM_RECOVERED' entry to audit_log
      if (ev.status === "processing") {
        await settleQuery(db.from("audit_log").insert({
          actor_id: "00000000-0000-0000-0000-000000000001",
          actor_role: "system",
          action: "STALE_CLAIM_RECOVERED",
          table_name: "fall_events",
          record_id: ev.fall_id,
          elder_id: ev.elder_id,
          extra: { reason: "Recovered stale orphaned processing emergency fall claim", timestamp: new Date().toISOString() },
        }), "audit_log");
      }

      let preciseLocationUrl: string | null = null;
      try {
        const { data: locEvent } = await db
          .from("location_events")
          .select("id, precise_longitude, precise_latitude, accuracy_metres, recorded_at")
          .eq("elder_id", ev.elder_id)
          .gte("recorded_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const loc = locEvent as LocationEventRow | null;

        if (loc && loc.precise_longitude && loc.precise_latitude) {
          const locationPayload = {
            lat: loc.precise_latitude,
            lng: loc.precise_longitude,
            accuracy_m: loc.accuracy_metres ?? 50,
            recorded_at: loc.recorded_at,
            fall_event_id: ev.fall_id,
            device_label: ev.device_label ?? "Geregistreerd Noodapparaat",
            expires_at: new Date(Date.now() + PRECISE_LOCATION_TTL * 1000).toISOString(),
          };

          const tempKey = `emergency-location/${ev.fall_id}.json`;
          // Full Deno-compatible Uint8Array upload
          const payloadBytes = new TextEncoder().encode(JSON.stringify(locationPayload));
          await db.storage.from("tts-cache").upload(tempKey, payloadBytes, {
            contentType: "application/json",
            upsert: true,
          });

          const signed = await db.storage.from("tts-cache").createSignedUrl(tempKey, PRECISE_LOCATION_TTL);
          if (!signed.error) preciseLocationUrl = signed.data.signedUrl;

          await db.from("audit_log").insert({
            actor_id: "system",
            actor_role: "system",
            action: "EMERGENCY_LOCATION_EXposure",
            table_name: "location_events",
            record_id: loc.id,
            elder_id: ev.elder_id,
            extra: { reason: "fall_escalation_dispatch", fall_event_id: ev.fall_id },
          });
        }
      } catch (locErr) {
        await captureException(locErr, { fn: "fn-fall-escalation", context: "location_extraction" });
        preciseLocationUrl = null;
      }

      const { data: family, error: familyError } = await db.from("family_relationships")
        .select("family_member_id")
        .eq("elder_id", ev.elder_id)
        .eq("elder_consented", true)
        .eq("is_active", true)
        .eq("notify_on_crisis", true);

      if (familyError) throw familyError;
      const stakeholders = family as Array<{ family_member_id: string }> | null ?? [];
      if (!stakeholders.length) throw new Error("No family recipients configured for fall escalation");
      let queued = 0;

      await Promise.allSettled(stakeholders.map(async (f) => {
        try {
          const notification = await dispatchNotification({
            recipient_id: String(f.family_member_id),
            elder_id: String(ev.elder_id),
            notification_type: "crisis_gedetecteerd",
            title_nl: "Mogelijke Val — Dringende Inspectie Nodig",
            title_en: "Possible Fall — Urgent Check-in Required",
            body_nl: `HAVEN heeft een val gedetecteerd via ${ev.device_label ?? ev.detection_source}.` + (preciseLocationUrl ? " Klik om de noodlocatie eenmalig te bekijken." : ""),
            body_en: `HAVEN detected a fall via ${ev.device_label ?? ev.detection_source}.` + (preciseLocationUrl ? " Click to view emergency location." : ""),
            data: {
              fall_event_id: ev.fall_id,
              detection_source: ev.detection_source,
              precise_location_url: preciseLocationUrl,
              location_expires_in_seconds: preciseLocationUrl ? PRECISE_LOCATION_TTL : null,
            },
          });
          // dispatchNotification can return after a failed push (including no token). Inspect
          // its persisted result rather than equating insertion with successful submission.
          const { data: persisted, error: notificationError } = await db.from("notifications")
            .select("id,send_error").eq("id", notification.id).maybeSingle();
          if (notificationError) throw notificationError;
          if (persisted && !persisted.send_error) queued += 1;
        } catch (pushErr) {
          const errMsg = String((pushErr as Error).message ?? pushErr);
          if (errMsg.includes("410") || errMsg.includes("Unregistered") || errMsg.includes("NotRegistered")) {
            await db.from("push_tokens").update({ is_active: false }).eq("profile_id", f.family_member_id).eq("is_active", true);
          }
          await captureException(pushErr, { fn: "fn-fall-escalation", context: "per_recipient_push", recipient: f.family_member_id });
        }
      }));

      if (queued === 0) throw new Error("No fall notification was submitted successfully");
      const { data: updated, error: updateError } = await db.from("fall_events")
        .update({ status: "family_alerted", family_notified_at: new Date().toISOString(), escalation_claimed_at: null })
        .eq("id", ev.fall_id)
        .eq("status", "processing")
        .eq("escalation_claimed_at", claimedAt)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;
      if (updated) {
        familyNotified.push(ev.fall_id);
      }
    } catch (patientErr) {
      failed.push(ev.fall_id);
      if (claimTime) {
        const { error: releaseError } = await db.from("fall_events")
          .update({ status: ev.status === "no_response" ? "no_response" : "possible", escalation_claimed_at: null })
          .eq("id", ev.fall_id).eq("status", "processing").eq("escalation_claimed_at", claimTime);
        if (releaseError) await captureException(releaseError, { fn: "fn-fall-escalation", context: "claim_release" });
      }
      await captureException(patientErr, { fn: "fn-fall-escalation", context: "per_patient_enclosure", fall_id: ev.fall_id });
    }
  }));

  return json({ ok: failed.length === 0, events_processed: familyNotified.length, alerted_ids: familyNotified, failed_ids: failed }, failed.length ? 503 : 200, req);
}));
