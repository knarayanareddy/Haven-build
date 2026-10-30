import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, userClient, errorResponse } from "../_shared/core.ts";
import { assertActorMatches, assertCarerPermission, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { executeRegulatoryEscalation } from "../_shared/regulatory_escalation.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-incident-report");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', reported_by_id: 'uuid', incident_type: 'string', description_nl: 'string', severity: 'string' }, { allowUnknown: true });
    
    const userId = await getJwtUserId(req);
    assertActorMatches(userId, String(body.reported_by_id), 'reported_by_id');
    await assertCarerPermission(userId, String(body.elder_id), 'incidents');

    const db = userClient(req);
    const { data, error } = await db.from("incidents").insert({ 
      elder_id: body.elder_id, 
      reported_by_id: userId, 
      incident_type: body.incident_type, 
      description_nl: body.description_nl, 
      severity: body.severity, 
      meldcode_step_reached: body.meldcode_step_reached ?? null, 
      external_report_made: Boolean(body.external_report_made), 
      external_authority_nl: body.external_authority_nl ?? null 
    }).select().single();
    
    if (error) throw error;

    // ─── Scope R9 Fix: Trigger Automated Regulatory Escalation Webhook ───
    // Fired with timeout / non-blocking; executes AFTER DB insert
    await executeRegulatoryEscalation(data.id, String(body.severity), String(body.elder_id));

    if (["hoog", "kritiek"].includes(String(body.severity))) {
      const { data: family } = await admin().from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true).eq("can_view_alerts", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: String(f.family_member_id), elder_id: String(body.elder_id), notification_type: "systeem", title_nl: "Zorgincident", title_en: "Care incident", body_nl: "Er is een zorgincident vastgelegd dat aandacht vraagt.", body_en: "A care incident was recorded and needs attention.", data: { incident_id: data.id } })));
    }

    await recordMetric("fn-incident-report", started, "success");
    return json({ success: true, incident_id: data.id }, 200, req);
  } catch (error) {
    await recordMetric("fn-incident-report", started, "error");
    return errorResponse(error, req);
  }
});
