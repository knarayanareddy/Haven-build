import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { voice_profile_id: "uuid" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);

    const idem = req.headers.get("idempotency-key") ?? body.idempotency_key ?? `revoke:${body.voice_profile_id}`;
    const result = await withIdempotency({
      key: idem,
      functionName: "fn-voice-profile-revoke",
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        const { data: profile, error: pErr } = await db.from("voice_profiles").select("*").eq("id", body.voice_profile_id).maybeSingle();
        if (pErr) throw pErr;
        if (!profile) throw new Error("Voice profile not found");
        assertSelf(userId, String(profile.owner_profile_id), "voice profile");

        await db.from("voice_profiles").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", body.voice_profile_id);

        // Sever any elder_voice_preferences pointing at this profile.
        await db.from("elder_voice_preferences").update({ voice_profile_id: null, use_familiar_voice: false, updated_at: new Date().toISOString() }).eq("voice_profile_id", body.voice_profile_id);

        // Audit row.
        await db.from("audit_log").insert({
          actor_id: userId,
          actor_role: "family",
          action: "DELETE",
          table_name: "voice_profiles",
          record_id: body.voice_profile_id,
          elder_id: profile.owner_profile_id,
          extra: { reason: body.reason ?? "owner_revocation", revoked_at: new Date().toISOString() },
        }).catch(() => undefined);

        return { body: { voice_profile_id: body.voice_profile_id, status: "revoked", elder_preferences_severed: true } };
      },
    });

    await recordMetric("fn-voice-profile-revoke", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-voice-profile-revoke", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});