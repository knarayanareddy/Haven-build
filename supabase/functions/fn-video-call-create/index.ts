import { admin, corsHeaders, HavenHttpError, json, readJsonBody, recordMetric, userClient, errorResponse } from "../_shared/core.ts";
import { assertElderOrFamilyCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { providerIsConfigured, providerMediaKind, resolveDefaultProvider } from "../_shared/videoJoinToken.ts";

const PROVIDERS = new Set(["mock", "livekit", "twilio"]);

// P1-9 FIX: Check video-call feature flag + dedicated permission
async function canInitiateVideoCall(userId: string, elderId: string): Promise<void> {
  // Step 1: Feature flag gate
  const dbAdmin = admin();
  const { data: flag } = await dbAdmin
    .from("feature_flags")
    .select("enabled")
    .eq("flag_key", "video_call_enabled")
    .maybeSingle();
  if (!flag?.enabled) throw new Error("Video calling is not enabled");

  // Step 2: Must have messages permission (basic family access)
  await assertElderOrFamilyCan(userId, elderId, "messages");

  // Step 3: Check elder consent for video calls — the video-call pack, not the scam-coaching
  // pack it used to fall back on. Consenting to scam coaching is not consenting to be filmed.
  const { data: consent } = await dbAdmin
    .from("consent_pack_status")
    .select("status")
    .eq("elder_id", elderId)
    .eq("pack_key", "core_video_call")
    .maybeSingle();
  if (!consent || consent.status !== "accepted") {
    throw new Error("Elder has not consented to video calling");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-video-call-create");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid" }, { allowUnknown: true });

    // The caller may name a provider; otherwise the deployment's configured one is used. The
    // family dashboard used to hardcode 'mock', so a deployment with real media credentials
    // still produced sessions no one could join.
    const provider = body.provider === undefined
      ? resolveDefaultProvider()
      : String(body.provider);
    if (!provider || !PROVIDERS.has(provider)) {
      if (body.provider === undefined) {
        throw new HavenHttpError("Video calling is not configured on this deployment", 503, "SERVICE_UNAVAILABLE");
      }
      throw new Error("provider must be mock, livekit or twilio");
    }
    const userId = await getJwtUserId(req);

    // No configured media provider means no call. Creating the session anyway is what made the
    // family button say "Belt…" over a room that did not exist.
    if (!providerIsConfigured(provider)) {
      throw new HavenHttpError("Video calling is not configured on this deployment", 503, "SERVICE_UNAVAILABLE");
    }

    // P1-9 FIX: Dedicated permission + feature flag check
    await canInitiateVideoCall(userId, String(body.elder_id));

    const idem = (req.headers.get("idempotency-key") ?? body.idempotency_key) as string | undefined;
    const result = await withIdempotency({
      key: idem,
      functionName: "fn-video-call-create",
      elderId: body.elder_id as string,
      profileId: userId,
      requestBody: body,
      run: async () => {
        const roomId = `haven-${body.elder_id}-${Date.now()}`;
        const db = userClient(req);
        const { data: session, error } = await db.from("video_call_sessions").insert({
          elder_id: body.elder_id,
          initiator_id: userId,
          provider,
          provider_room_id: roomId,
          status: "created",
        }).select().single();
        if (error) throw error;
        return {
          body: {
            video_call_session_id: session.id,
            provider,
            provider_room_id: roomId,
            status: "created",
            // 'none' only for the mock provider, which carries no media and must be labelled
            // as such by the caller rather than shown as a live call.
            media: providerMediaKind(provider),
            join_url_for_elder: `haven://call/${session.id}?role=elder`,
          },
        };
      },
    });

    await recordMetric("fn-video-call-create", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-video-call-create", started, "error");
    return errorResponse(e, req);
  }
});
