import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "organisation_nl", "system_name"]);
    const db = admin();
    const { data: job, error } = await db.from('external_care_sync_jobs').insert({ elder_id: body.elder_id, organisation_nl: body.organisation_nl, system_name: body.system_name, status: 'running', started_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    const { count: visits } = await db.from('carer_visit_logs').select('id', { count: 'exact', head: true }).eq('elder_id', body.elder_id).is('deleted_at', null);
    const { count: incidents } = await db.from('incidents').select('id', { count: 'exact', head: true }).eq('elder_id', body.elder_id);
    await db.from('external_care_sync_jobs').update({ status: 'completed', records_pushed: (visits ?? 0) + (incidents ?? 0), completed_at: new Date().toISOString() }).eq('id', job.id);
    await recordMetric('fn-care-system-sync', started, 'success');
    return json({ success: true, sync_job_id: job.id, records_pushed: (visits ?? 0) + (incidents ?? 0) });
  } catch (e) {
    await recordMetric('fn-care-system-sync', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
