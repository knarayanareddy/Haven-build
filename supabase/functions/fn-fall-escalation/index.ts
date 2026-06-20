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
    await dbAdmin.from("security_violations").insert({
      error_code: "429_OBJECT_SPIKE",
      table_name: "tts-cache",
      attempted_action: "UPLOAD_EMERGENCY_LOCATION",
      attempted_sql: "Object creation spike threshold exceeded",
      violation_reason: "Basic monitoring and rate control triggered to prevent S3 bucket cache explosion and billing DoS",
    }).catch(() => undefined);
    
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

  // 3. Multi-Patient / Per-Recipient Worker Isolation Loop
  await Promise.allSettled(fallsToProcess.map(async (ev) => {
    try {
      // FIX A3: Atomic test-and-set claim using RETURNING * supporting both possible and stale processing claims
      const { data: claimed, error: claimErr } = await db.from("fall_events")
        .update({ status: "processing" })
        .eq("id", ev.fall_id)
        .in("status", ["possible", "processing"])
        .select()
        .maybeSingle();

      if (claimErr || !claimed) return; // already claimed by another worker

      // FIX A3: When claiming a 'processing' row that was stale, log a 'STALE_CLAIM_RECOVERED' entry to audit_log
      if (ev.status === "processing") {
        await db.from("audit_log").insert({
          actor_id: "00000000-0000-0000-0000-000000000001",
          actor_role: "system",
          action: "STALE_CLAIM_RECOVERED",
          table_name: "fall_events",
          record_id: ev.fall_id,
          elder_id: ev.elder_id,
          extra: { reason: "Recovered stale orphaned processing emergency fall claim", timestamp: new Date().toISOString() },
        }).catch(() => undefined);
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

      const { data: family } = await db.from("family_relationships")
        .select("family_member_id")
        .eq("elder_id", ev.elder_id)
        .eq("elder_consented", true)
        .eq("is_active", true)
        .eq("notify_on_crisis", true);

      const stakeholders = family as Array<{ family_member_id: string }> | null ?? [];

      await Promise.allSettled(stakeholders.map(async (f) => {
        try {
          await dispatchNotification({
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
        } catch (pushErr) {
          const errMsg = String((pushErr as Error).message ?? pushErr);
          if (errMsg.includes("410") || errMsg.includes("Unregistered") || errMsg.includes("NotRegistered")) {
            await db.from("push_tokens").update({ is_active: false }).eq("profile_id", f.family_member_id).eq("is_active", true);
          }
          await captureException(pushErr, { fn: "fn-fall-escalation", context: "per_recipient_push", recipient: f.family_member_id });
        }
      }));

      const { data: updated } = await db.from("fall_events")
        .update({ status: "family_alerted", family_notified_at: new Date().toISOString() })
        .eq("id", ev.fall_id)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();

      if (updated) {
        familyNotified.push(ev.fall_id);
      }
    } catch (patientErr) {
      await captureException(patientErr, { fn: "fn-fall-escalation", context: "per_patient_enclosure", fall_id: ev.fall_id });
    }
  }));

  return json({ ok: true, events_processed: familyNotified.length, alerted_ids: familyNotified }, 200, req);
}));
