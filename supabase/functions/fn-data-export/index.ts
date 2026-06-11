import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id"]);
    const { data, error } = await admin().rpc("export_elder_data", { p_elder_id: body.elder_id });
    if (error) throw error;
    await recordMetric("fn-data-export", started, "success");
    return json({ success: true, export: data });
  } catch (e) {
    await recordMetric("fn-data-export", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
