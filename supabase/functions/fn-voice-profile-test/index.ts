import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { synthesizeSpeechToStorage } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { voice_profile_id: "uuid" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    // Authorization is enforced inside the run() block by checking the profile's owner.

    const idem = req.headers.get("idempotency-key") ?? body.idempotency_key;
    const result = await withIdempotency({
      key: idem,
      functionName: "fn-voice-profile-test",
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        const { data: profile, error } = await db.from("voice_profiles")
          .select("*").eq("id", body.voice_profile_id).maybeSingle();
        if (error) throw error;
        if (!profile) throw new Error("Voice profile not found");
        if (profile.owner_profile_id !== userId) throw new Error("Caller is not the owner of this voice profile");
        if (profile.status !== "ready") throw new Error(`Voice profile is ${profile.status}, not ready`);

        const locale: "en-GB" | "nl-NL" = body.locale === "en-GB" ? "en-GB" : "nl-NL";
        const text = locale === "nl-NL"
          ? "Hallo, dit is een korte test van uw opgenomen stem. Klinkt dit zoals u?"
          : "Hello, this is a short test of your recorded voice. Does this sound like you?";
        const interactionId = `vptest-${profile.id}-${Date.now()}`;
        const audioUrl = await synthesizeSpeechToStorage({
          elderId: profile.owner_profile_id,
          interactionId,
          text,
          locale,
        });
        return { body: { voice_profile_id: profile.id, audio_url: audioUrl, locale, text } };
      },
    });

    await recordMetric("fn-voice-profile-test", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-voice-profile-test", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});