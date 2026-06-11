import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["provider"]);
    const legal = Boolean(body.legal_basis_confirmed);
    const db = admin();
    const { data: job, error } = await db.from('medication_catalog_sync_jobs').insert({ provider: body.provider, status: legal ? 'running' : 'disabled', requires_agb_code: body.provider === 'g_standaard', legal_basis_confirmed: legal, started_at: legal ? new Date().toISOString() : null }).select().single();
    if (error) throw error;
    let updated = 0;
    if (legal && Array.isArray(body.entries)) {
      for (const entry of body.entries) {
        await db.from('medication_catalog_entries').upsert({ provider: body.provider, external_code: entry.external_code, name_nl: entry.name_nl, active_substance_nl: entry.active_substance_nl, form_nl: entry.form_nl, strength_text: entry.strength_text, interaction_notes_nl: entry.interaction_notes_nl, updated_from_provider_at: new Date().toISOString() }, { onConflict: 'provider,external_code' });
        updated++;
      }
      await db.from('medication_catalog_sync_jobs').update({ status: 'completed', records_received: body.entries.length, records_updated: updated, completed_at: new Date().toISOString() }).eq('id', job.id);
    }
    await recordMetric('fn-medication-catalog-sync', started, 'success');
    return json({ success: true, catalog_sync_job_id: job.id, status: legal ? 'completed' : 'disabled_until_legal_basis_confirmed', records_updated: updated });
  } catch (e) {
    await recordMetric('fn-medication-catalog-sync', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
