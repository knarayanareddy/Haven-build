import { admin, corsHeaders, json, readJsonBody, recordMetric, requireFields, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess, requireVendorSecretHeader } from "../_shared/internal.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    if (req.headers.get('x-haven-internal-key') || req.headers.get('x-internal-key')) requireInternalAccess(req);
    else requireVendorSecretHeader(req, 'HAVEN_EVENT_INGEST_SECRET', ['x-haven-event-secret', 'x-haven-vendor-secret']);
    const body = await readJsonBody(req) as Record<string, unknown>;
    requireFields(body, ["events"]);
    const db = admin();
    let inserted = 0;
    for (const event of body.events) {
      requireFields(event, ["postcode_pc4", "location_label_nl", "title_nl", "event_date", "source"]);
      const { data: tags } = await db.from("interest_tags").select("id,tag_key").in("tag_key", event.relevant_tag_keys ?? []);
      const { error } = await db.from("neighbourhood_events").insert({
        postcode_pc4: event.postcode_pc4,
        location_label_nl: event.location_label_nl,
        location_label_en: event.location_label_en ?? event.location_label_nl,
        distance_label_nl: event.distance_label_nl,
        distance_label_en: event.distance_label_en ?? event.distance_label_nl,
        title_nl: event.title_nl,
        title_en: event.title_en ?? event.title_nl,
        description_nl: event.description_nl,
        description_en: event.description_en ?? event.description_nl,
        event_date: event.event_date,
        event_time: event.event_time,
        is_free: event.is_free ?? true,
        relevant_tag_ids: (tags ?? []).map((t) => t.id),
        source: event.source,
        source_url: event.source_url,
      });
      if (error) throw error;
      inserted++;
    }
    await recordMetric("fn-buurt-events-ingest", started, "success");
    return json({ success: true, events_inserted: inserted });
  } catch (e) {
    await recordMetric("fn-buurt-events-ingest", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});