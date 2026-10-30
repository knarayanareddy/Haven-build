import { admin, corsHeaders, json, readJsonBody, recordMetric, requireFields, safeErrorMessage, sha256, userClient, errorResponse } from "../_shared/core.ts";
import { requireInternalAccess, requireVendorSecretHeader } from "../_shared/internal.ts";
import { asyncWrapper } from "../_shared/async_wrapper.ts";

interface FhirResource {
  resourceType?: string;
  id?: string;
  medicationCodeableConcept?: { text?: string };
  medicationReference?: { display?: string };
  dosageInstruction?: Array<{ text?: string }>;
  description?: string;
  serviceType?: Array<{ text?: string }>;
  start?: string;
}

interface ImportRequestBody {
  elder_id: string;
  provider?: string;
  resources: Array<FhirResource>;
}

Deno.serve(asyncWrapper("fn-medmij-fhir-import", async (req: Request) => {
  const started = Date.now();
  let requestElderId: string | null = null;
  try {
    if (req.headers.get('x-haven-internal-key') || req.headers.get('x-internal-key')) {
      requireInternalAccess(req);
    } else {
      requireVendorSecretHeader(req, 'MEDMIJ_IMPORT_SECRET', ['x-medmij-secret', 'x-haven-vendor-secret']);
    }

    const body = await readJsonBody(req) as Record<string, unknown>;
    const input = body as unknown as ImportRequestBody;
    requestElderId = typeof body.elder_id === "string" ? body.elder_id : null;

    requireFields(body, ["elder_id", "resources"]);

    if (!Array.isArray(input.resources)) {
      throw new Error("400: Malformed FHIR resources array");
    }

    const db = admin();
    const { data: job, error: jobError } = await db.from('fhir_import_jobs').insert({ 
      elder_id: input.elder_id, 
      provider: input.provider ?? 'medmij', 
      status: 'running', 
      resource_type: 'Bundle', 
      resource_count: input.resources.length, 
      started_at: new Date().toISOString() 
    }).select().single();

    if (jobError) throw jobError;

    let stagedMeds = 0;
    let mappedAppts = 0;

    for (const resource of input.resources) {
      const type = resource.resourceType ?? 'Unknown';
      const resourceHash = await sha256(String(resource.id ?? JSON.stringify(resource).slice(0, 200)));
      
      // ─── LOCKED POLICY: Staging row created; direct medications table insertion completely blocked ───
      if (type === 'MedicationRequest') {
        const medText = resource.medicationCodeableConcept?.text ?? resource.medicationReference?.display ?? 'Medicijn uit MedMij';
        const dosage = resource.dosageInstruction?.[0]?.text ?? 'Controleer dosering';

        const { error: stagingError } = await db.from("fhir_medication_staging").upsert({
          elder_id: input.elder_id,
          fhir_job_id: job.id,
          resource_id_hash: resourceHash,
          raw_resource: resource as unknown as Record<string, unknown>,
          extracted_name_nl: medText,
          extracted_dosage_nl: dosage,
          proposed_schedule_times: ["08:00"],
          status: "pending_review",
        }, { onConflict: "elder_id,resource_id_hash" });

        if (stagingError) throw stagingError;

        stagedMeds++;
      }

      if (type === 'Appointment') {
        const start = resource.start ?? new Date().toISOString();
        const title = resource.description ?? resource.serviceType?.[0]?.text ?? 'Afspraak uit MedMij';
        
        const { data: appt } = await db.from('appointments').insert({ 
          elder_id: input.elder_id, 
          title_nl: title, 
          title_en: title, 
          starts_at: start, 
          is_medical: true, 
          source: 'medmij', 
          medmij_reference: resource.id 
        }).select().single();

        await db.from('health_record_imports').upsert({ 
          elder_id: input.elder_id, 
          fhir_job_id: job.id, 
          fhir_resource_type: type, 
          fhir_resource_id_hash: resourceHash, 
          mapped_table: "appointments", 
          mapped_record_id: appt?.id, 
          source_provider: input.provider ?? 'medmij' 
        }, { onConflict: 'elder_id,fhir_resource_type,fhir_resource_id_hash' });

        mappedAppts++;
      }
    }

    await db.from('fhir_import_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job.id);
    await recordMetric('fn-medmij-fhir-import', started, 'success');

    return json({ 
      success: true, 
      fhir_job_id: job.id, 
      resources_received: input.resources.length, 
      staged_medications: stagedMeds,
      appointments_mapped: mappedAppts 
    }, 200, req);
  } catch (error) {
    try {
      if (requestElderId) {
        await admin().from("fhir_import_jobs")
          .update({ status: "failed", error_message: safeErrorMessage(error), completed_at: new Date().toISOString() })
          .eq("elder_id", requestElderId)
          .eq("status", "running")
          .is("completed_at", null);
      }
    } catch (_) { /* best-effort failure ledger */ }
    await recordMetric('fn-medmij-fhir-import', started, 'error');
    return errorResponse(error, req);
  }
}));
