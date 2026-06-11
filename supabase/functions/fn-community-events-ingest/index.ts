import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["source_key", "events"]);
    const db = admin();
    const { data: source, error: sourceError } = await db.from('community_event_sources').select('*').eq('source_key', body.source_key).eq('status', 'active').maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new Error('Community event source is not active');
    let inserted = 0;
    for (const event of body.events) {
      requireFields(event, ['postcode_pc4', 'location_label_nl', 'title_nl', 'event_date']);
      const { data: tags } = await db.from('interest_tags').select('id').in('tag_key', event.relevant_tag_keys ?? []);
      const { error } = await db.from('neighbourhood_events').insert({ postcode_pc4: event.postcode_pc4, location_label_nl: event.location_label_nl, location_label_en: event.location_label_en ?? event.location_label_nl, distance_label_nl: event.distance_label_nl, distance_label_en: event.distance_label_en ?? event.distance_label_nl, title_nl: event.title_nl, title_en: event.title_en ?? event.title_nl, description_nl: event.description_nl, description_en: event.description_en ?? event.description_nl, event_date: event.event_date, event_time: event.event_time, is_free: event.is_free ?? true, relevant_tag_ids: (tags ?? []).map((t) => t.id), source: source.source_name, source_url: event.source_url ?? source.base_url });
      if (error) throw error;
      inserted++;
    }
    await db.from('community_event_sources').update({ last_ingested_at: new Date().toISOString() }).eq('id', source.id);
    await recordMetric('fn-community-events-ingest', started, 'success');
    return json({ success: true, events_inserted: inserted });
  } catch (e) {
    await recordMetric('fn-community-events-ingest', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
