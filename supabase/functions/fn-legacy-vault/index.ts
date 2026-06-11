import { admin, cors, json, recordMetric, requireFields, sha256 } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "service_name"]);
    const secretPath = body.secret_reference ? `legacy/${body.elder_id}/${await sha256(String(body.secret_reference))}` : null;
    const { data, error } = await admin().from('legacy_accounts').insert({ elder_id: body.elder_id, service_name: body.service_name, service_url: body.service_url, account_identifier_hint: body.account_identifier_hint, encrypted_secret_path: secretPath, intended_recipient_id: body.intended_recipient_id, action_on_death: body.action_on_death ?? 'no_action', notes_nl: body.notes_nl, notes_en: body.notes_en, last_reviewed_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    await recordMetric('fn-legacy-vault', started, 'success');
    return json({ success: true, legacy_account_id: data.id });
  } catch (e) {
    await recordMetric('fn-legacy-vault', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
