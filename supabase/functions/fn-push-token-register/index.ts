import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["profile_id", "token", "platform"]);
    const { data, error } = await admin().from("push_tokens").upsert({ profile_id: body.profile_id, token: body.token, platform: body.platform, is_active: true }, { onConflict: "token" }).select().single();
    if (error) throw error;
    await recordMetric("fn-push-token-register", started, "success");
    return json({ success: true, push_token_id: data.id });
  } catch (e) {
    await recordMetric("fn-push-token-register", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
