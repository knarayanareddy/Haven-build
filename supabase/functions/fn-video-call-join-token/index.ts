import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, sha256, userClient } from "../_shared/core.ts";
import { assertElderOrFamilyCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { video_call_session_id: "uuid" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);

    const result = await withIdempotency({
      key: body.idempotency_key ?? String(body.video_call_session_id),
      functionName: "fn-video-call-join-token",
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        const { data: session, error } = await db.from("video_call_sessions")
          .select("*").eq("id", body.video_call_session_id).maybeSingle();
        if (error) throw error;
        if (!session) throw new Error("Video call session not found");
        if (session.status !== "created" && session.status !== "ringing" && session.status !== "joined") throw new Error(`Session is ${session.status}, cannot join`);
        await assertElderOrFamilyCan(userId, String(session.elder_id), "messages");

        const token = crypto.randomUUID();
        const expiresIn = 300; // 5 minutes
        await db.from("video_call_sessions").update({ status: "joined", started_at: new Date().toISOString() }).eq("id", session.id);
        return { body: { video_call_session_id: session.id, provider: session.provider, provider_room_id: session.provider_room_id, token, expires_in_seconds: expiresIn } };
      },
    });

    await recordMetric("fn-video-call-join-token", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-video-call-join-token", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});