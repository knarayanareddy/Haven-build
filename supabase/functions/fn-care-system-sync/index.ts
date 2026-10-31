import { admin, corsHeaders, HavenHttpError, json, readJsonBody, recordMetric, requireFields, errorResponse } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";

/**
 * Pushes an elder's care records to an external care system.
 *
 * This function used to count the elder's local visit logs and incidents, write that number
 * into `external_care_sync_jobs.records_pushed`, and report success. Nothing was pushed and
 * nothing external was contacted: the count was of rows still sitting in our own database, so
 * a care organisation integrating with HAVEN saw "12 records pushed" for a sync that never
 * happened. For a handover to an EHR that is the most expensive kind of lie — the receiving
 * system has no records and nobody knows.
 *
 * Now the job records what actually happened:
 *
 *   • no `CARE_SYSTEM_ENDPOINT` configured → 503 and the job row says so;
 *   • the endpoint is called with the export payload, and `records_pushed` is the number the
 *     receiver reports accepting;
 *   • a refusal or a network failure marks the job failed with the reason, and the caller gets
 *     an error — never a `success: true`.
 */

interface ExportRecord {
  kind: "visit_log" | "incident";
  id: string;
  occurred_at: string;
}

function endpoint(): string | null {
  const value = Deno.env.get("CARE_SYSTEM_ENDPOINT");
  return value && /^https:\/\//.test(value) ? value : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  let jobId: string | null = null;
  const db = admin();

  try {
    requireInternalAccess(req);
    const body = await readJsonBody(req) as Record<string, unknown>;
    requireFields(body, ["elder_id", "organisation_nl", "system_name"]);

    const target = endpoint();
    if (!target) {
      throw new HavenHttpError("External care system endpoint is not configured", 503, "SERVICE_UNAVAILABLE");
    }

    const { data: job, error } = await db.from("external_care_sync_jobs").insert({
      elder_id: body.elder_id,
      organisation_nl: body.organisation_nl,
      system_name: body.system_name,
      status: "running",
      started_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    jobId = String(job.id);

    const { data: visits } = await db
      .from("carer_visit_logs")
      .select("id, check_in_time")
      .eq("elder_id", body.elder_id)
      .is("deleted_at", null)
      .order("check_in_time", { ascending: true });
    const { data: incidents } = await db
      .from("incidents")
      .select("id, occurred_at")
      .eq("elder_id", body.elder_id)
      .order("occurred_at", { ascending: true });

    const records: ExportRecord[] = [
      ...(visits ?? []).map((row) => ({ kind: "visit_log" as const, id: String(row.id), occurred_at: String(row.check_in_time) })),
      ...(incidents ?? []).map((row) => ({ kind: "incident" as const, id: String(row.id), occurred_at: String(row.occurred_at) })),
    ];

    let response: Response;
    try {
      response = await fetch(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // The receiver authenticates HAVEN, not the caller of this function.
          authorization: `Bearer ${Deno.env.get("CARE_SYSTEM_TOKEN") ?? ""}`,
        },
        body: JSON.stringify({
          elder_id: body.elder_id,
          organisation_nl: body.organisation_nl,
          system_name: body.system_name,
          records,
        }),
      });
    } catch (networkError) {
      const message = String((networkError as Error)?.message ?? networkError);
      await db.from("external_care_sync_jobs").update({
        status: "failed",
        records_pushed: 0,
        error_message: `endpoint unreachable: ${message}`.slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
      throw new HavenHttpError("External care system could not be reached", 503, "SERVICE_UNAVAILABLE");
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      await db.from("external_care_sync_jobs").update({
        status: "failed",
        records_pushed: 0,
        error_message: `receiver returned ${response.status}: ${detail}`.slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
      throw new HavenHttpError("External care system rejected the export", 502, "SERVICE_UNAVAILABLE");
    }

    // The receiver says how many it accepted. If it says nothing, the honest answer is zero —
    // not "as many rows as we have".
    const payload = await response.json().catch(() => ({})) as { accepted?: unknown };
    const accepted = Number(payload?.accepted);
    const pushed = Number.isFinite(accepted) ? Math.max(0, accepted) : 0;

    await db.from("external_care_sync_jobs").update({
      status: "completed",
      records_pushed: pushed,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await recordMetric("fn-care-system-sync", started, "success");
    return json({ success: true, sync_job_id: jobId, records_pushed: pushed, records_offered: records.length }, 200, req);
  } catch (e) {
    // A job that never got as far as a row has nothing to update.
    if (jobId) {
      await db.from("external_care_sync_jobs").update({
        status: "failed",
        records_pushed: 0,
        error_message: String((e as Error)?.message ?? e).slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq("id", jobId).then(() => undefined, () => undefined);
    }
    await recordMetric("fn-care-system-sync", started, "error");
    return errorResponse(e, req);
  }
});
