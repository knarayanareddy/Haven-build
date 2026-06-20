import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, sha256, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', service_name: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'legacy vault record');
    const secretPath = body.secret_reference ? `legacy/${userId}/${await sha256(String(body.secret_reference))}` : null;
    const { data, error } = await userClient(req).from('legacy_accounts').insert({ elder_id: userId, service_name: body.service_name, service_url: body.service_url, account_identifier_hint: body.account_identifier_hint, encrypted_secret_path: secretPath, intended_recipient_id: body.intended_recipient_id, action_on_death: body.action_on_death ?? 'no_action', notes_nl: body.notes_nl, notes_en: body.notes_en, last_reviewed_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    await recordMetric('fn-legacy-vault', started, 'success');
    return json({ success: true, legacy_account_id: data.id });
  } catch (e) {
    await recordMetric('fn-legacy-vault', started, 'error');
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});