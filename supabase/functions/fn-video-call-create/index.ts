import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertElderOrFamilyCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

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

  // Step 3: Check elder consent for video calls
  const { data: consent } = await dbAdmin
    .from("consent_pack_status")
    .select("status")
    .eq("elder_id", elderId)
    .eq("pack_key", "shield_scam_coaching") // closest consent pack — TODO: add dedicated video_call pack
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
    validateBody(body, { elder_id: "uuid", provider: "string" }, { allowUnknown: true });
    if (!PROVIDERS.has(String(body.provider))) throw new Error("provider must be mock, livekit or twilio");
    const userId = await getJwtUserId(req);

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
          provider: body.provider,
          provider_room_id: roomId,
          status: "created",
        }).select().single();
        if (error) throw error;
        return { body: { video_call_session_id: session.id, provider: body.provider, provider_room_id: roomId, status: "created", join_url_for_elder: `haven://call/${session.id}?role=elder` } };
      },
    });

    await recordMetric("fn-video-call-create", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-video-call-create", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
