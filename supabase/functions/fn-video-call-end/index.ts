import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
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
      functionName: "fn-video-call-end",
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        const { data: session, error } = await db.from("video_call_sessions")
          .select("*").eq("id", body.video_call_session_id).maybeSingle();
        if (error) throw error;
        if (!session) throw new Error("Video call session not found");
        await assertElderOrFamilyCan(userId, String(session.elder_id), "messages");

        await db.from("video_call_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", session.id);
        return { body: { video_call_session_id: session.id, status: "ended" } };
      },
    });

    await recordMetric("fn-video-call-end", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-video-call-end", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});