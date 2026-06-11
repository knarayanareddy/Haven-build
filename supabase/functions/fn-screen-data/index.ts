import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "screen_id"]);
    const db = admin();
    const locale = body.locale ?? "en-GB";
    const { data: schema } = await db.from("screen_schemas").select("schema,schema_version").eq("screen_id", body.screen_id).eq("locale", locale).eq("is_active", true).maybeSingle();
    const queries = await Promise.all([
      db.from("medication_reminders").select("id,scheduled_time,status,medications(name_nl,name_en,dose_description_nl,dose_description_en)").eq("elder_id", body.elder_id).gte("scheduled_time", new Date().toISOString().slice(0, 10)).order("scheduled_time", { ascending: true }).limit(5),
      db.from("family_messages").select("id,sender_id,message_type,content_nl,content_en,created_at").eq("elder_id", body.elder_id).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
      db.from("scam_events").select("id,alert_level,score_composite,explanation_nl,explanation_en,created_at").eq("elder_id", body.elder_id).is("deleted_at", null).order("created_at", { ascending: false }).limit(3),
      db.from("neighbourhood_profiles").select("postcode_pc4,neighbourhood_label,is_active,walk_buddy_seeking,family_can_see_connections").eq("elder_id", body.elder_id).maybeSingle(),
    ]);
    await recordMetric("fn-screen-data", started, "success");
    return json({ success: true, screen_id: body.screen_id, locale, schema: schema?.schema ?? null, data: { reminders: queries[0].data ?? [], messages: queries[1].data ?? [], scam_events: queries[2].data ?? [], neighbourhood_profile: queries[3].data ?? null } });
  } catch (e) {
    await recordMetric("fn-screen-data", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
