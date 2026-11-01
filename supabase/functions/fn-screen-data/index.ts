import { corsHeaders, json, readJsonBody, recordMetric, userClient, errorResponse } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { validateBody } from "../_shared/validation.ts";

/**
 * Everything one elder screen renders.
 *
 * This function returned reminders, messages, scam events and the neighbourhood profile, and
 * the elder app called it from nowhere: `ElderScreen` built its context from a shell whose
 * every array was empty. The result was an app that showed "0 due today", "no messages" and an
 * empty family list to a signed-in older adult whose data existed in every one of those tables.
 *
 * The three additions — family, tasks and open confirmations — are the same defect from the
 * other end: the renderer draws a family list, a task list and the "are you OK?" card, and
 * nothing ever handed it any of them.
 *
 * Open confirmations matter most. A detected fall writes a `pending_confirmations` row and
 * `fn-fall-escalation` contacts the family if it is not answered within its window. Until this
 * query existed there was no way for the elder's own screen to learn that the question had been
 * asked, so the prompt the escalation timer waits on could never be answered from the app.
 */
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
    const nowIso = new Date().toISOString();

    const { data: schema, error: schemaError } = await db
      .from("screen_schemas")
      .select("schema,schema_version")
      .eq("screen_id", body.screen_id)
      .eq("locale", locale)
      .eq("is_active", true)
      .maybeSingle();
    if (schemaError) throw schemaError;

    const queries = await Promise.all([
      db.from("medication_reminders").select("id,scheduled_time,status,medications(name_nl,name_en,dose_description_nl,dose_description_en)").eq("elder_id", userId).gte("scheduled_time", nowIso.slice(0, 10)).order("scheduled_time", { ascending: true }).limit(8),
      db.from("family_messages").select("id,sender_id,message_type,content_nl,content_en,storage_path,read_by_elder,created_at").eq("elder_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
      db.from("scam_events").select("id,alert_level,score_composite,explanation_nl,explanation_en,created_at").eq("elder_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(3),
      db.from("neighbourhood_profiles").select("postcode_pc4,neighbourhood_label,is_active,walk_buddy_seeking,family_can_see_connections").eq("elder_id", userId).maybeSingle(),
      // Only consented, active relationships: an elder must never see a delegate who has been
      // removed, and the renderer names the primary contact.
      db.from("family_relationships")
        .select("family_member_id,relation_type,relation_label_nl,is_primary,profiles:family_member_id(preferred_name,full_name)")
        .eq("elder_id", userId)
        .eq("is_active", true)
        .eq("elder_consented", true)
        .order("is_primary", { ascending: false }),
      db.from("tasks")
        .select("id,title_nl,title_en,notes_nl,notes_en,due_date,completed")
        .eq("elder_id", userId)
        .eq("completed", false)
        .order("due_date", { ascending: true })
        .limit(10),
      // The questions the escalation sweep is waiting on. Expired rows are excluded: asking the
      // elder to answer a prompt whose window has closed would record an answer nothing acts on.
      db.from("pending_confirmations")
        .select("id,confirmation_type,payload,expires_at,created_at")
        .eq("elder_id", userId)
        .is("resolved_at", null)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: true })
        .limit(3),
      // The elder's own care visits. RLS on carer_visit_logs already limits this to their own
      // rows; `deleted_at` filters notes a carer withdrew.
      db.from("carer_visit_logs")
        .select("id,carer_id,visit_date,check_in_time,check_out_time,observations_nl")
        .eq("elder_id", userId)
        .is("deleted_at", null)
        .order("check_in_time", { ascending: false })
        .limit(5),
      // Limit to recent incoming sessions; ended, joined and stale calls do not ring.
      db.from("video_call_sessions").select("id,initiator_id,provider,status,created_at")
        .eq("elder_id", userId).neq("initiator_id", userId)
        .in("status", ["created", "ringing"])
        .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
        .order("created_at", { ascending: false }).limit(1),
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
        family: queries[4].data ?? [],
        tasks: queries[5].data ?? [],
        pending_confirmations: queries[6].data ?? [],
        visits: queries[7].data ?? [],
        incoming_calls: queries[8].data ?? [],
      },
    }, 200, req);
  } catch (e) {
    await recordMetric("fn-screen-data", started, "error");
    return errorResponse(e, req);
  }
});
