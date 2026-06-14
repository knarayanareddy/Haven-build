import { admin, cors, corsHeaders, dispatchNotification, json, recordMetric, requireInternalAccess, safeErrorMessage } from "../_shared/core.ts";

const ESCALATION_MINUTES = Number(Deno.env.get("FALL_ESCALATION_MINUTES") ?? 3);
const CARER_ESCALATION_MINUTES = Number(Deno.env.get("FALL_CARER_ESCALATION_MINUTES") ?? 8);
const PRECISE_LOCATION_TTL = 1800; // ─── Phase 2.2: 30 minutes ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);

    const db = admin();
    const escalationThreshold = new Date(Date.now() - ESCALATION_MINUTES * 60 * 1000).toISOString();
    const carerThreshold = new Date(Date.now() - CARER_ESCALATION_MINUTES * 60 * 1000).toISOString();

    // Phase 1: still pending → notify family
    const { data: pending, error: pErr } = await db
      .from("fall_events")
      .select("id, elder_id, detection_source, confidence, detected_at, family_notified_at")
      .eq("status", "possible")
      .is("elder_ack_at", null)
      .lt("detected_at", escalationThreshold)
      .is("family_notified_at", null)
      .limit(50);
    if (pErr) throw pErr;
    const familyNotified: string[] = [];
    for (const ev of pending ?? []) {
      // ─── Phase 2.2: Fetch latest precise location for one-time sharing ───
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

        if (locEvent && locEvent.precise_longitude && locEvent.precise_latitude) {
          // Store the precise location in a temporary signed payload
          const locationPayload = {
            lat: locEvent.precise_latitude,
            lng: locEvent.precise_longitude,
            accuracy_m: locEvent.accuracy_metres ?? 50,
            recorded_at: locEvent.recorded_at,
            fall_event_id: ev.id,
            expires_at: new Date(Date.now() + PRECISE_LOCATION_TTL * 1000).toISOString(),
          };

          // Write a temporary storage object with 30-min TTL
          const tempKey = `emergency-location/${ev.id}.json`;
          await db.storage.from("tts-cache").upload(tempKey, JSON.stringify(locationPayload), {
            contentType: "application/json",
            upsert: true,
          });

          const signed = await db.storage.from("tts-cache").createSignedUrl(tempKey, PRECISE_LOCATION_TTL);
          if (!signed.error) preciseLocationUrl = signed.data.signedUrl;

          // Audit log: precise location shared during emergency
          await db.from("audit_log").insert({
            actor_id: "system",
            actor_role: "system",
            action: "READ",
            table_name: "location_events",
            record_id: locEvent.id,
            elder_id: ev.elder_id,
            extra: {
              reason: "fall_escalation_no_response",
              fall_event_id: ev.id,
              location_ttl_seconds: PRECISE_LOCATION_TTL,
            },
          });
        }
      } catch (_) {
        // Location sharing is best-effort. If it fails, continue with escalation.
        preciseLocationUrl = null;
      }

      const { data: family } = await db.from("family_relationships")
        .select("family_member_id").eq("elder_id", ev.elder_id).eq("elder_consented", true).eq("is_active", true).eq("notify_on_crisis", true);
      for (const f of family ?? []) {
        await dispatchNotification({
          recipient_id: f.family_member_id,
          elder_id: ev.elder_id,
          notification_type: "crisis_gedetecteerd",
          title_nl: "Mogelijke val — geen reactie",
          title_en: "Possible fall — no response yet",
          body_nl: "Bel rustig even om te checken of alles goed gaat." + (preciseLocationUrl ? " U kunt de locatie eenmalig bekijken." : ""),
          body_en: "Please calmly call to check on them." + (preciseLocationUrl ? " You can view their location once." : ""),
          data: {
            fall_event_id: ev.id,
            detection_source: ev.detection_source,
            precise_location_url: preciseLocationUrl,  // ─── Phase 2.2 ───
            location_expires_in_seconds: preciseLocationUrl ? PRECISE_LOCATION_TTL : null,
          },
        });
      }
      await db.from("fall_events").update({ status: "no_response", family_notified_at: new Date().toISOString() }).eq("id", ev.id);
      familyNotified.push(ev.id);
    }

    // Phase 2: still no_response after CARER_ESCALATION_MINUTES → notify carers
    const { data: carers, error: cErr } = await db
      .from("fall_events")
      .select("id, elder_id, carer_notified_at")
      .eq("status", "no_response")
      .is("carer_notified_at", null)
      .lt("detected_at", carerThreshold)
      .limit(50);
    if (cErr) throw cErr;
    const carerNotified: string[] = [];
    for (const ev of carers ?? []) {
      const { data: carerRels } = await db.from("carer_relationships")
        .select("carer_member_id").eq("elder_id", ev.elder_id).eq("elder_consented", true).eq("is_active", true).eq("can_file_incidents", true);
      for (const cr of carerRels ?? []) {
        await dispatchNotification({
          recipient_id: cr.carer_member_id,
          elder_id: ev.elder_id,
          notification_type: "crisis_gedetecteerd",
          title_nl: "Mogelijke val — controleer nu",
          title_en: "Possible fall — please check now",
          body_nl: "Familie is al geïnformeerd. Gelieve zo snel mogelijk langs te gaan.",
          body_en: "Family already informed. Please check on them as soon as possible.",
          data: { fall_event_id: ev.id },
        });
      }
      await db.from("fall_events").update({ carer_notified_at: new Date().toISOString() }).eq("id", ev.id);
      carerNotified.push(ev.id);
    }

    await recordMetric("fn-fall-escalation", started, "success");
    return json({ ok: true, family_notified: familyNotified.length, carer_notified: carerNotified.length }, 200, req);
  } catch (e) {
    await recordMetric("fn-fall-escalation", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
