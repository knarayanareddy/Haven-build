import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-buurt-optout");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) throw new Error('Invalid user ID');
    assertSelf(userId, String(body.elder_id), 'buurt opt-out');
    const db = userClient(req);

    // Soft-delete the neighbourhood profile
    const { error: profileError } = await db.from("neighbourhood_profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("elder_id", userId);
    if (profileError) throw profileError;

    // Delete interest tags
    const { error: tagsError } = await db.from("elder_interest_tags")
      .delete().eq("elder_id", userId);
    if (tagsError) throw tagsError;

    // P1-15 FIX: String interpolation with backticks
    const { error: connError } = await db.from("neighbourhood_connections")
      .update({ status: "ended", ended_by: userId, ended_reason_internal: "elder_opted_out" })
      .or(`initiator_elder_id.eq.${userId},recipient_elder_id.eq.${userId}`);
    if (connError) throw connError;

    await recordMetric("fn-buurt-optout", started, "success");
    return json({ success: true, message_nl: "Uw buurtprofiel is verwijderd.", message_en: "Your neighbourhood profile has been removed." }, 200, req);
  } catch (e) {
    await recordMetric("fn-buurt-optout", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
