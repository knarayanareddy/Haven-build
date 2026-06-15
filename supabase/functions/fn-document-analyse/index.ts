import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { captureException } from "../_shared/sentry.ts";
import { assertNoBsnInPayload, scrubBsnFromLogs } from "../_shared/bsn_guard.ts";

function looksLikeBsn(text: string) {
  const compact = text.replace(/\D/g, "");
  return /\d{9}/.test(compact);
}

function assertOwnedStoragePath(userId: string, storagePath: string) {
  const ownerId = storagePath.split('/').filter(Boolean)[0] ?? '';
  if (!ownerId) throw new Error('storage_path must include an owner folder');
  if (ownerId !== userId) throw new Error('storage_path must belong to the authenticated elder');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  let rawBodyPayload: unknown = null;
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    rawBodyPayload = body;

    // ─── Authoritative Server-Side BSN Guard ───
    assertNoBsnInPayload(body);

    validateBody(body, { elder_id: 'uuid', storage_path: 'string', document_type: 'string', label_nl: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'document analysis');
    assertOwnedStoragePath(userId, String(body.storage_path));

    const extracted = String(body.extracted_text ?? "");
    const bsnDetected = looksLikeBsn(extracted);
    const db = userClient(req);
    const { data: doc, error: docError } = await db.from("documents").insert({
      elder_id: userId,
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
      elder_id: userId,
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
      const { data: family } = await admin().from("family_relationships").select("family_member_id").eq("elder_id", userId).eq("elder_consented", true).eq("is_active", true).eq("can_view_alerts", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: userId, notification_type: "systeem", title_nl: "Belangrijk document", title_en: "Important document", body_nl: "Er is een gevoelig document opgeslagen. Vraag rustig of u kunt helpen.", body_en: "A sensitive document was stored. Calmly ask if you can help.", data: { document_id: doc.id } })));
    }
    await recordMetric("fn-document-analyse", started, "success");
    return json({ success: true, document_id: doc.id, analysis_job_id: job.id, redaction_required: bsnDetected, status: job.status });
  } catch (error) {
    const isBsnErr = (error as { isBsnViolation?: boolean }).isBsnViolation;
    const status = (error as { status?: number }).status ?? 400;
    const cleanErr = isBsnErr ? "422: Prohibited Dutch Citizen Service Number (BSN) detected." : safeErrorMessage(error);

    // Scrubber helper entirely removes 9-digit BSN candidates from logged payloads
    const scrubbedBody = scrubBsnFromLogs(rawBodyPayload);
    await captureException(new Error(cleanErr), { fn: "fn-document-analyse", payload: scrubbedBody });
    await recordMetric("fn-document-analyse", started, "error");
    return json({ error: cleanErr }, isBsnErr ? 422 : status, req);
  }
});
