import { rateLimit } from "../_shared/ratelimit.ts";
import { corsHeaders, HavenHttpError, json, readJsonBody, recordMetric, sha256, userClient, errorResponse } from "../_shared/core.ts";
import { assertElderOrFamilyCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import {
  assertJoinTokenSecret,
  mintProviderToken,
  providerIsConfigured,
  providerMediaKind,
  verifyJoinToken,
} from "../_shared/videoJoinToken.ts";

/**
 * Redeems a join token for media credentials.
 *
 * Before this function there was no consumer at all: `fn-video-call-join-token` handed out a
 * random UUID that nothing read, so "answering" a call and dropping the token was
 * indistinguishable from joining one. Here the token has to survive four checks —
 * signature, expiry, stored digest, unused — and match the caller, and only then does the
 * session become `joined`.
 *
 * The provider token returned is what a media SDK can actually use. With no provider
 * configured the request fails with 503 rather than returning a plausible-looking string.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-video-call-redeem");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { video_call_session_id: "uuid", token: "string" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);

    const db = userClient(req);
    const { data: session, error } = await db.from("video_call_sessions")
      .select("*").eq("id", body.video_call_session_id).maybeSingle();
    if (error) throw error;
    if (!session) throw new HavenHttpError("Video call session not found", 404, "NOT_FOUND");
    await assertElderOrFamilyCan(userId, String(session.elder_id), "messages");

    if (session.status === "ended" || session.status === "failed") {
      throw new HavenHttpError(`Session is ${session.status}, cannot join`, 409, "CONFLICT");
    }
    if (!session.join_token_hash || !session.join_token_expires_at) {
      throw new HavenHttpError("No join token has been issued for this session", 403, "FORBIDDEN");
    }
    if (session.join_token_used_at) {
      throw new HavenHttpError("This join token has already been used", 409, "CONFLICT");
    }

    const secret = assertJoinTokenSecret(Deno.env.get("VIDEO_JOIN_TOKEN_SECRET"));
    const verification = await verifyJoinToken(String(body.token), secret);
    if (!verification.valid) {
      throw new HavenHttpError(
        verification.reason === "expired" ? "Join token has expired" : "Join token is not valid",
        403,
        "FORBIDDEN"
      );
    }

    const payload = verification.payload;
    // The token is bound to one session and one person: a token stolen from the elder's handset
    // is useless to anyone else, and cannot be replayed against another call.
    if (payload.sid !== String(session.id)) {
      throw new HavenHttpError("Join token is for a different call", 403, "FORBIDDEN");
    }
    if (payload.sub !== userId) {
      throw new HavenHttpError("Join token was issued to someone else", 403, "FORBIDDEN");
    }
    if (session.join_token_subject && String(session.join_token_subject) !== userId) {
      throw new HavenHttpError("Join token was issued to someone else", 403, "FORBIDDEN");
    }
    if ((await sha256(String(body.token))) !== session.join_token_hash) {
      throw new HavenHttpError("Join token is not the one issued for this call", 403, "FORBIDDEN");
    }
    if (new Date(String(session.join_token_expires_at)).getTime() <= Date.now()) {
      throw new HavenHttpError("Join token has expired", 403, "FORBIDDEN");
    }

    if (!providerIsConfigured(String(session.provider))) {
      throw new HavenHttpError("Video calling is not configured on this deployment", 503, "SERVICE_UNAVAILABLE");
    }

    const media = providerMediaKind(String(session.provider));
    const providerToken = await mintProviderToken({
      provider: String(session.provider),
      roomId: String(session.provider_room_id),
      identity: userId,
      ttlSeconds: 3600,
    });
    if (media === "webrtc" && !providerToken) {
      // Configured but unmintable is a deployment fault, not a client error. Better to say so
      // than to mark the session joined over a room with no credentials.
      throw new HavenHttpError("Video provider rejected the credential request", 503, "SERVICE_UNAVAILABLE");
    }

    const { error: updateError } = await db.from("video_call_sessions").update({
      status: "joined",
      started_at: session.started_at ?? new Date().toISOString(),
      join_token_used_at: new Date().toISOString(),
    }).eq("id", session.id).select("id").single();
    if (updateError) throw updateError;

    await recordMetric("fn-video-call-redeem", started, "success");
    return json({
      video_call_session_id: session.id,
      status: "joined",
      provider: session.provider,
      provider_room_id: session.provider_room_id,
      media,
      // Null for the mock provider: there is no media to attach, and the client must show
      // that rather than pretending a call is live.
      provider_token: providerToken,
      role: payload.role,
      expires_in_seconds: 3600,
    }, 200, req);
  } catch (e) {
    await recordMetric("fn-video-call-redeem", started, "error");
    return errorResponse(e, req);
  }
});
