import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id"]);
    const db = admin();
    const { data: profile, error: pErr } = await db.from("neighbourhood_profiles").select("postcode_pc4").eq("elder_id", body.elder_id).eq("is_active", true).is("deleted_at", null).single();
    if (pErr) throw pErr;
    const { data: nearby } = await db.from("neighbourhood_profiles").select("elder_id").eq("postcode_pc4", profile.postcode_pc4).eq("is_active", true).is("deleted_at", null);
    const { data: myTags } = await db.from("elder_interest_tags").select("tag_id, interest_tags(tag_key,label_nl,label_en)").eq("elder_id", body.elder_id);
    const tagIds = (myTags ?? []).map((t) => t.tag_id);
    const { data: matchingTags } = tagIds.length ? await db.from("elder_interest_tags").select("tag_id, interest_tags(tag_key,label_nl,label_en)").in("tag_id", tagIds).neq("elder_id", body.elder_id) : { data: [] };
    const counts = new Map<string, { label_nl: string; label_en: string; count: number }>();
    for (const row of matchingTags ?? []) {
      const tag = Array.isArray(row.interest_tags) ? row.interest_tags[0] : row.interest_tags;
      if (!tag) continue;
      const current = counts.get(tag.tag_key) ?? { label_nl: tag.label_nl, label_en: tag.label_en, count: 0 };
      current.count++;
      counts.set(tag.tag_key, current);
    }
    const { data: events } = await db.from("neighbourhood_events").select("id,title_nl,title_en,location_label_nl,location_label_en,distance_label_nl,distance_label_en,event_date,event_time,is_free").eq("postcode_pc4", profile.postcode_pc4).eq("is_active", true).gte("event_date", new Date().toISOString().slice(0,10)).order("event_date", { ascending: true }).limit(5);
    await recordMetric("fn-buurt-discover", started, "success");
    return json({
      nearby_haven_users_count: Math.max(0, (nearby?.length ?? 1) - 1),
      shared_interest_matches: [...counts.entries()].map(([tag_key, v]) => ({ tag_key, label_nl: v.label_nl, label_en: v.label_en, nearby_count: v.count })),
      suggested_events: events ?? [],
      walk_buddy_available: (nearby?.length ?? 0) > 1,
    });
  } catch (e) {
    await recordMetric("fn-buurt-discover", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
