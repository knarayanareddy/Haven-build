import { admin, cors, json, recordMetric, requireFields, sha256 } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["profile_id", "platform", "device_id"]);
    const device_id_hash = await sha256(String(body.device_id));
    const { data, error } = await admin().from("device_sessions").upsert({ profile_id: body.profile_id, platform: body.platform, device_label: body.device_label, device_id_hash, last_seen_at: new Date().toISOString(), revoked_at: body.revoked ? new Date().toISOString() : null }, { onConflict: "profile_id,device_id_hash" }).select().single();
    if (error) throw error;
    await recordMetric("fn-device-session", started, "success");
    return json({ success: true, device_session_id: data.id });
  } catch (e) {
    await recordMetric("fn-device-session", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
