import { rateLimit } from "../_shared/ratelimit.ts";
import { settleQuery } from "../_shared/settle.ts";
import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertActorMatches, assertCarerPermission, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-care-visit-log");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', carer_id: 'uuid', visit_date: 'string' }, { allowUnknown: true });
    
    const userId = await getJwtUserId(req);
    assertActorMatches(userId, String(body.carer_id), 'carer_id');
    await assertCarerPermission(userId, String(body.elder_id), 'create_visit_logs');

    // ─── Scope R6 Fix: Post-Erasure Identity Check ───
    // Query profiles.status for the elder_id in the request body
    // If status != 'active' -> return 403 immediately; no DB write
    // Log rejection to audit_log
    const dbAdmin = admin();
    const { data: targetProfile } = await dbAdmin
      .from("profiles")
      .select("status")
      .eq("id", body.elder_id)
      .maybeSingle();

    if (targetProfile?.status !== "active") {
      await settleQuery(dbAdmin.from("audit_log").insert({
        actor_id: userId,
        actor_role: "carer_professional",
        action: "POST_ERASURE_WRITE_REJECTION",
        table_name: "carer_visit_logs",
        elder_id: String(body.elder_id),
        extra: { reason: "Attempted to sync offline capture entries for an already erased or suspended older adult entity", profile_status: targetProfile?.status },
      }), "audit_log");
      const err = new Error("403 Forbidden: Targeted older adult entity has been erased or suspended; write rejected");
      (err as unknown as { status: number }).status = 403;
      throw err;
    }

    const db = userClient(req);
    const { data, error } = await db.from("carer_visit_logs").insert({ 
      elder_id: body.elder_id, 
      carer_id: userId, 
      visit_date: body.visit_date, 
      check_in_time: body.check_in_time ?? new Date().toISOString(), 
      check_out_time: body.check_out_time ? String(body.check_out_time) : null, 
      activities_nl: body.activities_nl ?? [], 
      observations_nl: body.observations_nl ? String(body.observations_nl) : null, 
      mood_observed: body.mood_observed ? Number(body.mood_observed) : null, 
      concerns_nl: body.concerns_nl ? String(body.concerns_nl) : null, 
      follow_up_required: Boolean(body.follow_up_required) 
    }).select().single();
    
    if (error) throw error;
    await recordMetric("fn-care-visit-log", started, "success");
    return json({ success: true, visit_log_id: data.id }, 200, req);
  } catch (error) {
    const isR6Err = String((error as Error).message ?? error).includes("403 Forbidden: Targeted older adult");
    const status = (error as { status?: number }).status ?? (isR6Err ? 403 : 400);

    await recordMetric("fn-care-visit-log", started, "error");
    return json({ error: safeErrorMessage(error) }, status, req);
  }
});
