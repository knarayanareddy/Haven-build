import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

function fuzz(n: number) {
  return n + (Math.sin(n * 1000) * 0.0009);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-location-ingest");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', latitude: 'number', longitude: 'number', accuracy_metres: 'number', timestamp: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'location event');

    const db = admin();
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const outside = Boolean(body.force_safe_zone_exit) || Number(body.distance_from_home_m ?? 0) > 500;
    const eventType = outside ? "veilige_zone_verlaten" : "check_in";

    const { data: eventId, error } = await db.rpc("insert_location_event", {
      p_elder_id: userId,
      p_event_type: eventType,
      p_longitude: lng,
      p_latitude: lat,
      p_fuzzed_longitude: fuzz(lng),
      p_fuzzed_latitude: fuzz(lat),
      p_accuracy_metres: Number(body.accuracy_metres),
      p_store_precise: outside,
    });
    if (error) throw error;

    if (outside) {
      const { data: family } = await db
        .from("family_relationships")
        .select("family_member_id")
        .eq("elder_id", userId)
        .eq("elder_consented", true)
        .eq("is_active", true)
        .eq("notify_on_safe_zone_exit", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({
        recipient_id: f.family_member_id,
        elder_id: userId,
        notification_type: "veilige_zone_verlaten",
        title_nl: "Veilige zone verlaten",
        title_en: "Safe zone left",
        body_nl: "HAVEN zag een veilige-zone gebeurtenis. Locatie is privacyvriendelijk vervaagd.",
        body_en: "HAVEN saw a safe-zone event. Location is privacy-preserving and fuzzed.",
        data: { location_event_id: String(eventId) },
      })));
    }

    await recordMetric("fn-location-ingest", started, "success");
    return json({ success: true, location_event_id: eventId, precise_location_ttl_hours: outside ? 24 : 0 });
  } catch (e) {
    await recordMetric("fn-location-ingest", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});