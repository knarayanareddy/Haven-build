import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId, invalidateRelationshipCache } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', consent_type: 'string', granted: 'boolean' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'consent update orchestration');

    const db = userClient(req);
    const dbAdmin = admin();

    // ─── 1. Complete GDPR Right to Erasure / Automated Purge Execution ───
    if (body.consent_type === "gdpr_complete_erasure" && body.granted === false) {
      // 1a. Fully sanitize sensitive document-vault S3 object envelopes
      try {
        const { data: files } = await db.storage.from("document-vault").list(userId);
        if (files && files.length > 0) {
          const filePaths = files.map((f) => `${userId}/${f.name}`);
          await db.storage.from("document-vault").remove(filePaths);
        }
      } catch (s3Err) {
        await captureException(s3Err, { fn: "fn-consent-update", context: "s3_vault_erasure" });
      }

      // 1b. Execute Canonical Idempotent Dynamic Deep Redaction Stored Procedure
      const { error: rpcErr } = await dbAdmin
        .rpc("soft_purge_profile", { p_target_id: userId });

      if (rpcErr) throw rpcErr;

      // 1c. Revoke global authentication refresh session mappings
      await dbAdmin.auth.admin.signOut(userId);

      await recordMetric("fn-consent-update", started, "success");
      return json({ 
        ok: true, 
        erasure_executed: true, 
        message_nl: "Uw account, relaties en free-text medische notities zijn succesvol beëindigd en geredigeerd." 
      }, 200, req);
    }

    // ─── 2. Standard Modular Granular Consent Tracking ───
    const { data: consent, error } = await db.from("consent_records").insert({ 
      elder_id: userId, 
      consent_type: body.consent_type, 
      granted: Boolean(body.granted), 
      channel: body.channel ?? "elder_app", 
      consent_version: body.consent_version ?? "1.2.2", 
      withdrawn_at: body.granted ? null : new Date().toISOString() 
    }).select().single();

    if (error) throw error;

    // Mutate corresponding operational family relationships if consent is retracted
    if (body.relationship_id && body.relationship_kind === "family") {
      const { data: relRow } = await db.from("family_relationships").select("family_member_id").eq("id", body.relationship_id).maybeSingle();
      const { error: relError } = await db.from("family_relationships")
        .update({ elder_consented: Boolean(body.granted), elder_consented_at: body.granted ? new Date().toISOString() : null, is_active: Boolean(body.granted) })
        .eq("id", body.relationship_id)
        .eq("elder_id", userId);

      if (relError) throw relError;

      // FIX B3: After updating family_relationships.is_active = false, call invalidateRelationshipCache(delegate_id, elder_id).
      if (body.granted === false && (relRow?.family_member_id || body.delegate_id)) {
        invalidateRelationshipCache(String(relRow?.family_member_id || body.delegate_id), userId);
      }
    }

    await recordMetric("fn-consent-update", started, "success");
    return json({ success: true, consent_record_id: consent.id }, 200, req);
  } catch (e) {
    await captureException(e, { fn: "fn-consent-update" });
    await recordMetric("fn-consent-update", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
