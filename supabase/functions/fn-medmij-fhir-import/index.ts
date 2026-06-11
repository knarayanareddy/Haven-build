import { admin, cors, json, recordMetric, requireFields, sha256 } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "resources"]);
    const db = admin();
    const { data: job, error: jobError } = await db.from('fhir_import_jobs').insert({ elder_id: body.elder_id, provider: body.provider ?? 'medmij', status: 'running', resource_type: 'Bundle', resource_count: body.resources.length, started_at: new Date().toISOString() }).select().single();
    if (jobError) throw jobError;
    let mapped = 0;
    for (const resource of body.resources) {
      const type = resource.resourceType ?? 'Unknown';
      const resourceHash = await sha256(String(resource.id ?? JSON.stringify(resource).slice(0, 200)));
      let mappedTable = null;
      let mappedRecordId = null;
      if (type === 'MedicationRequest') {
        const medText = resource.medicationCodeableConcept?.text ?? resource.medicationReference?.display ?? 'Medicijn uit MedMij';
        const dosage = resource.dosageInstruction?.[0]?.text ?? 'Controleer dosering';
        const { data: med } = await db.from('medications').insert({ elder_id: body.elder_id, name_nl: medText, name_en: medText, dose_description_nl: dosage, dose_description_en: dosage, frequency: 'dagelijks', schedule_times: ['08:00'], instructions_nl: 'Geïmporteerd uit MedMij; controleer met apotheek.', instructions_en: 'Imported from MedMij; review with pharmacy.', is_active: true, start_date: new Date().toISOString().slice(0,10) }).select().single();
        mappedTable = 'medications'; mappedRecordId = med?.id; mapped++;
      }
      if (type === 'Appointment') {
        const start = resource.start ?? new Date().toISOString();
        const title = resource.description ?? resource.serviceType?.[0]?.text ?? 'Afspraak uit MedMij';
        const { data: appt } = await db.from('appointments').insert({ elder_id: body.elder_id, title_nl: title, title_en: title, starts_at: start, is_medical: true, source: 'medmij', medmij_reference: resource.id }).select().single();
        mappedTable = 'appointments'; mappedRecordId = appt?.id; mapped++;
      }
      await db.from('health_record_imports').upsert({ elder_id: body.elder_id, fhir_job_id: job.id, fhir_resource_type: type, fhir_resource_id_hash: resourceHash, mapped_table: mappedTable, mapped_record_id: mappedRecordId, source_provider: body.provider ?? 'medmij' }, { onConflict: 'elder_id,fhir_resource_type,fhir_resource_id_hash' });
    }
    await db.from('fhir_import_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job.id);
    await recordMetric('fn-medmij-fhir-import', started, 'success');
    return json({ success: true, fhir_job_id: job.id, resources_received: body.resources.length, resources_mapped: mapped });
  } catch (e) {
    await recordMetric('fn-medmij-fhir-import', started, 'error');
    return json({ error: String(e.message ?? e) }, 400);
  }
});
