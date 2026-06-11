import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["release_version"]);
    const db = admin();
    if (body.check_key) {
      await db.from("app_release_checks").upsert({ release_version: body.release_version, check_key: body.check_key, check_name: body.check_name ?? body.check_key, status: body.status ?? "pending", evidence_path: body.evidence_path, notes: body.notes }, { onConflict: "release_version,check_key" });
    }
    const { data, error } = await db.from("app_release_checks").select("*").eq("release_version", body.release_version).order("check_key");
    if (error) throw error;
    const ready = (data ?? []).length > 0 && (data ?? []).every((check) => check.status === "passed" || check.status === "waived");
    await recordMetric("fn-release-check", started, "success");
    return json({ success: true, release_version: body.release_version, ready_for_release: ready, checks: data });
  } catch (e) {
    await recordMetric("fn-release-check", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
