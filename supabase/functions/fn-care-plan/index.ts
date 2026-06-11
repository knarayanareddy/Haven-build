import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "created_by_id", "title_nl"]);
    const db = admin();
    const { data: plan, error } = await db.from("care_plans").insert({ elder_id: body.elder_id, created_by_id: body.created_by_id, status: body.status ?? "draft", title_nl: body.title_nl, title_en: body.title_en, goals_nl: body.goals_nl ?? [], goals_en: body.goals_en ?? [], review_due_date: body.review_due_date }).select().single();
    if (error) throw error;
    if (Array.isArray(body.items) && body.items.length) {
      await db.from("care_plan_items").insert(body.items.map((item: Record<string, unknown>) => ({ care_plan_id: plan.id, elder_id: body.elder_id, category: item.category ?? "other", instruction_nl: item.instruction_nl, instruction_en: item.instruction_en, frequency: item.frequency, assigned_role: item.assigned_role })));
    }
    await recordMetric("fn-care-plan", started, "success");
    return json({ success: true, care_plan_id: plan.id });
  } catch (e) {
    await recordMetric("fn-care-plan", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
