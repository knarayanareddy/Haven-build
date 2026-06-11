import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id"]);
    const db = admin();
    const { data: flags, error } = await db.from("feature_flags").select("flag_key");
    if (error) throw error;
    const entries: Record<string, boolean> = {};
    for (const f of flags ?? []) {
      const { data } = await db.rpc("evaluate_feature_flag", { p_flag_key: f.flag_key, p_elder_id: body.elder_id });
      entries[f.flag_key] = Boolean(data);
    }
    await recordMetric("fn-feature-flags", started, "success");
    return json({ success: true, flags: entries });
  } catch (e) {
    await recordMetric("fn-feature-flags", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
