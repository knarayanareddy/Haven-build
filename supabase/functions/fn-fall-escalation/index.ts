import { admin, corsHeaders, dispatchNotification, json, recordMetric, requireInternalAccess, safeErrorMessage } from "../_shared/core.ts";
import { captureException } from "../_shared/sentry.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    // 1. Strict internal scheduled cron authentication gate
    requireInternalAccess(req);

    const db = admin();

    // 2. EMERGENCY DISCOVERY: Completely uncoupled from downstream device revocation logic.
    // Fixed RPC call usage for supabase-js (without .select)
    const { data: activeFalls, error: fallErr } = await db.rpc("get_active_emergency_falls");

    if (fallErr) throw fallErr;

    const fallsToProcess = (activeFalls as EmergencyFallRow[] ?? []).slice(0, 50);
    const familyNotified: string[] = [];

    // 3. Multi-Patient / Per-Recipient Worker Isolation Loop
    await Promise.allSettled(fallsToProcess.map(async (ev) => {
      try {
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
            // Fixed storage upload to use Blob/Uint8Array (Deno compatible)
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

        // Fetch full family stakeholder network
        const { data: family } = await db.from("family_relationships")
          .select("family_member_id")
          .eq("elder_id", ev.elder_id)
          .eq("elder_consented", true)
          .eq("is_active", true)
          .eq("notify_on_crisis", true);

        const stakeholders = family as Array<{ family_member_id: string }> | null ?? [];

        // E1: Per-Recipient push isolation using Promise.allSettled
        await Promise.allSettled(stakeholders.map(async (f) => {
          try {
            await dispatchNotification({
              recipient_id: f.family_member_id,
              elder_id: ev.elder_id,
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
            // E1: Deactivate ONLY the specific failing token, not all target tokens for a profile
            const errMsg = String((pushErr as Error).message ?? pushErr);
            if (errMsg.includes("410") || errMsg.includes("Unregistered") || errMsg.includes("NotRegistered")) {
              await db.from("push_tokens").update({ is_active: false }).eq("profile_id", f.family_member_id).eq("is_active", true);
            }
            await captureException(pushErr, { fn: "fn-fall-escalation", context: "per_recipient_push", recipient: f.family_member_id });
          }
        }));

        // Idempotent and highly concurrent safe status progression
        const { data: updated } = await db.from("fall_events")
          .update({ status: "family_alerted", family_notified_at: new Date().toISOString() })
          .eq("id", ev.fall_id)
          .eq("status", "possible")
          .select("id")
          .maybeSingle();

        if (updated) {
          familyNotified.push(ev.fall_id);
        }
      } catch (patientErr) {
        await captureException(patientErr, { fn: "fn-fall-escalation", context: "per_patient_enclosure", fall_id: ev.fall_id });
      }
    }));

    await recordMetric("fn-fall-escalation", started, "success");
    return json({ ok: true, events_processed: familyNotified.length, alerted_ids: familyNotified }, 200, req);
  } catch (error) {
    await captureException(error, { fn: "fn-fall-escalation" });
    await recordMetric("fn-fall-escalation", started, "error");
    return json({ ok: false, error: safeErrorMessage(error) }, 500, req);
  }
});
