import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";

function looksLikeBsn(text: string) {
  const compact = text.replace(/\D/g, "");
  return /\d{9}/.test(compact);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "storage_path", "document_type", "label_nl"]);
    const extracted = String(body.extracted_text ?? "");
    const bsnDetected = looksLikeBsn(extracted);
    const db = admin();
    const { data: doc, error: docError } = await db.from("documents").insert({
      elder_id: body.elder_id,
      label_nl: body.label_nl,
      label_en: body.label_en ?? body.label_nl,
      document_type: body.document_type,
      storage_path: body.storage_path,
      summary_nl: bsnDetected ? "Document vraagt om redactie voordat HAVEN het samenvat." : "Dit document is rustig samengevat en veilig opgeslagen.",
      summary_en: bsnDetected ? "Document requires redaction before HAVEN summarises it." : "This document was calmly summarised and stored securely.",
      is_sensitive_legal: Boolean(body.is_sensitive_legal),
      in_emergency_profile: Boolean(body.in_emergency_profile),
    }).select().single();
    if (docError) throw docError;
    const { data: job, error: jobError } = await db.from("document_analysis_jobs").insert({
      elder_id: body.elder_id,
      document_id: doc.id,
      storage_path: body.storage_path,
      status: bsnDetected ? "needs_review" : "completed",
      bsn_detected: bsnDetected,
      redaction_required: bsnDetected,
      summary_nl: doc.summary_nl,
      summary_en: doc.summary_en,
      doctor_questions_nl: body.document_type === "medical" ? ["Moet ik iets veranderen aan mijn medicijnen?", "Wanneer moet ik terugkomen?"] : null,
      doctor_questions_en: body.document_type === "medical" ? ["Should anything change about my medicines?", "When should I come back?"] : null,
    }).select().single();
    if (jobError) throw jobError;

    if (body.is_sensitive_legal) {
      const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true).eq("can_view_alerts", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id, notification_type: "systeem", title_nl: "Belangrijk document", title_en: "Important document", body_nl: "Er is een gevoelig document opgeslagen. Vraag rustig of u kunt helpen.", body_en: "A sensitive document was stored. Calmly ask if you can help.", data: { document_id: doc.id } })));
    }
    await recordMetric("fn-document-analyse", started, "success");
    return json({ success: true, document_id: doc.id, analysis_job_id: job.id, redaction_required: bsnDetected, status: job.status });
  } catch (e) {
    await recordMetric("fn-document-analyse", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
