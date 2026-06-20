import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-screen-data");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', screen_id: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'screen data request');

    const db = userClient(req);
    const locale = body.locale ?? "en-GB";
    const { data: schema, error: schemaError } = await db
      .from("screen_schemas")
      .select("schema,schema_version")
      .eq("screen_id", body.screen_id)
      .eq("locale", locale)
      .eq("is_active", true)
      .maybeSingle();
    if (schemaError) throw schemaError;

    const queries = await Promise.all([
      db.from("medication_reminders").select("id,scheduled_time,status,medications(name_nl,name_en,dose_description_nl,dose_description_en)").eq("elder_id", userId).gte("scheduled_time", new Date().toISOString().slice(0, 10)).order("scheduled_time", { ascending: true }).limit(5),
      db.from("family_messages").select("id,sender_id,message_type,content_nl,content_en,created_at").eq("elder_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
      db.from("scam_events").select("id,alert_level,score_composite,explanation_nl,explanation_en,created_at").eq("elder_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(3),
      db.from("neighbourhood_profiles").select("postcode_pc4,neighbourhood_label,is_active,walk_buddy_seeking,family_can_see_connections").eq("elder_id", userId).maybeSingle(),
    ]);
    for (const q of queries) if (q.error) throw q.error;

    await recordMetric("fn-screen-data", started, "success");
    return json({
      success: true,
      screen_id: body.screen_id,
      locale,
      schema: schema?.schema ?? null,
      data: {
        reminders: queries[0].data ?? [],
        messages: queries[1].data ?? [],
        scam_events: queries[2].data ?? [],
        neighbourhood_profile: queries[3].data ?? null,
      },
    });
  } catch (e) {
    await recordMetric("fn-screen-data", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});