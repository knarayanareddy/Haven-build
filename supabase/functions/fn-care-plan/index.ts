import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertActorMatches, assertCarerCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', created_by_id: 'uuid', title_nl: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertActorMatches(userId, String(body.created_by_id), 'created_by_id');
    await assertCarerCan(userId, String(body.elder_id));
    const db = userClient(req);
    const { data: plan, error } = await db.from("care_plans").insert({ elder_id: body.elder_id, created_by_id: userId, status: body.status ?? "draft", title_nl: body.title_nl, title_en: body.title_en, goals_nl: body.goals_nl ?? [], goals_en: body.goals_en ?? [], review_due_date: body.review_due_date }).select().single();
    if (error) throw error;
    if (Array.isArray(body.items) && body.items.length) {
      const { error: itemsError } = await db.from("care_plan_items").insert(body.items.map((item: Record<string, unknown>) => ({ care_plan_id: plan.id, elder_id: body.elder_id, category: item.category ?? "other", instruction_nl: item.instruction_nl, instruction_en: item.instruction_en, frequency: item.frequency, assigned_role: item.assigned_role })));
      if (itemsError) throw itemsError;
    }
    await recordMetric("fn-care-plan", started, "success");
    return json({ success: true, care_plan_id: plan.id });
  } catch (e) {
    await recordMetric("fn-care-plan", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});