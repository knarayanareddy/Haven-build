import { admin, cors, json, recordMetric, requireFields, sha256 } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    const db = admin();
    if (body.action === "create_token") {
      requireFields(body, ["elder_id", "label"]);
      const raw = crypto.randomUUID() + crypto.randomUUID();
      const token_hash = await sha256(raw);
      const { data, error } = await db.from("emergency_access_tokens").insert({ elder_id: body.elder_id, token_hash, label: body.label, expires_at: body.expires_at ?? null }).select().single();
      if (error) throw error;
      await recordMetric("fn-emergency-profile", started, "success");
      return json({ success: true, token_id: data.id, emergency_token: raw });
    }
    requireFields(body, ["emergency_token"]);
    const { data, error } = await db.rpc("get_emergency_profile", { p_token: body.emergency_token });
    if (error) throw error;
    await recordMetric("fn-emergency-profile", started, "success");
    return json({ success: true, emergency_profile: data });
  } catch (e) {
    await recordMetric("fn-emergency-profile", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
