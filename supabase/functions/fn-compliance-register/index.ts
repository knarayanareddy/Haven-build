import { corsHeaders, json, readJsonBody, recordMetric, requireFields, safeErrorMessage, userClient } from "../_shared/core.ts";
import { requireAdminBearer } from "../_shared/internal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await requireAdminBearer(req);
    const body = await readJsonBody(req) as Record<string, unknown>;
    const db = userClient(req);
    if (body.kind === "vendor") {
      requireFields(body, ["vendor_name", "purpose", "data_shared", "storage_region"]);
      const { data, error } = await db.from("vendor_register").upsert({ vendor_name: body.vendor_name, purpose: body.purpose, data_shared: body.data_shared, storage_region: body.storage_region, dpa_status: body.dpa_status ?? "draft", scc_required: Boolean(body.scc_required), bsn_transmitted: false, notes: body.notes }, { onConflict: "vendor_name" }).select().single();
      if (error) throw error;
      await recordMetric("fn-compliance-register", started, "success");
      return json({ success: true, vendor: data });
    }
    if (body.kind === "dpia") {
      requireFields(body, ["assessment_key", "title", "scope"]);
      const { data, error } = await db.from("dpia_assessments").upsert({ assessment_key: body.assessment_key, title: body.title, scope: body.scope, status: body.status ?? "draft", residual_risk: body.residual_risk ?? "unassessed", document_path: body.document_path, notes: body.notes }, { onConflict: "assessment_key" }).select().single();
      if (error) throw error;
      await recordMetric("fn-compliance-register", started, "success");
      return json({ success: true, dpia: data });
    }
    const { data, error } = await db.from("vendor_register").select("vendor_name,purpose,dpa_status,scc_required,review_due_date").is("deleted_at", null).order("vendor_name");
    if (error) throw error;
    await recordMetric("fn-compliance-register", started, "success");
    return json({ success: true, vendors: data });
  } catch (e) {
    await recordMetric("fn-compliance-register", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});