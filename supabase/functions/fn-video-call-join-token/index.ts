import { rateLimit } from "../_shared/ratelimit.ts";
import { corsHeaders, HavenHttpError, json, readJsonBody, recordMetric, sha256, userClient, errorResponse } from "../_shared/core.ts";
import { assertElderOrFamilyCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import {
  assertJoinTokenSecret,
  buildJoinTokenPayload,
  providerIsConfigured,
  signJoinToken,
} from "../_shared/videoJoinToken.ts";

const TOKEN_TTL_SECONDS = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-video-call-join-token");
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

        // Joining is participation in a video call: that needs the video-call pack, not the
        // messages permission alone. This mirrors the check in fn-video-call-create.
        const { data: consent } = await db.from("consent_pack_status")
          .select("status")
          .eq("elder_id", String(session.elder_id))
          .eq("pack_key", "core_video_call")
          .maybeSingle();
        if (!consent || consent.status !== "accepted") {
          throw new HavenHttpError("Elder has not consented to video calling", 403, "FORBIDDEN");
        }

        // A token is useless if no media can follow it, and issuing one would repeat the old
        // lie: an app that says "joining" over a room nobody hosts.
        if (!providerIsConfigured(String(session.provider))) {
          throw new HavenHttpError("Video calling is not configured on this deployment", 503, "SERVICE_UNAVAILABLE");
        }

        const secret = assertJoinTokenSecret(Deno.env.get("VIDEO_JOIN_TOKEN_SECRET"));
        const role = userId === String(session.elder_id) ? "elder" : "family";
        const payload = buildJoinTokenPayload({
          sessionId: String(session.id),
          subject: userId,
          role,
          ttlSeconds: TOKEN_TTL_SECONDS,
        });
        const token = await signJoinToken(payload, secret);

        // Only the hash is stored. The row keeps what redemption needs to check — the digest,
        // the expiry and the subject — so a leaked database dump contains no usable token.
        const { error: updateError } = await db.from("video_call_sessions").update({
          join_token_hash: await sha256(token),
          join_token_expires_at: new Date(payload.exp * 1000).toISOString(),
          join_token_subject: userId,
          join_token_role: role,
          join_token_used_at: null,
          // Not 'joined': the caller holds an invitation, not a connection. The row becomes
          // 'joined' when fn-video-call-redeem verifies this token.
          status: session.status === "created" ? "ringing" : session.status,
        }).eq("id", session.id).select("id").single();
        if (updateError) {
          // Fail loudly: returning a token whose hash was not stored means it can never be
          // redeemed, so the caller would hold an unusable string and think it worked.
          throw updateError;
        }

        return {
          body: {
            video_call_session_id: session.id,
            provider: session.provider,
            provider_room_id: session.provider_room_id,
            token,
            role,
            expires_in_seconds: TOKEN_TTL_SECONDS,
          },
        };
      },
    });

    await recordMetric("fn-video-call-join-token", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-video-call-join-token", started, "error");
    return errorResponse(e, req);
  }
});
