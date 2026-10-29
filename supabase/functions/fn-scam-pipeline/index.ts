import { rateLimit } from "../_shared/ratelimit.ts";
import { admin, corsHeaders, dispatchNotification, json, recordMetric, readJsonBody, scoreScam, sha256, userClient, errorResponse } from "../_shared/core.ts";
import { getJwtUserId, assertElderOrFamilyCan } from "../_shared/authz.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { assertNoBsnText, assertMaxLength, MAX_STRING_FIELD, validateBody } from "../_shared/validation.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req) => {
  // P0-1+P2-1 FIX: dynamic CORS + security headers via corsHeaders(req)
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-scam-pipeline");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', channel: 'string', signal_reference: 'string', raw_content: 'string' }, { allowUnknown: true });
    assertNoBsnText(body.raw_content);
    // P1-3 FIX: cap input size
    assertMaxLength(body.raw_content, MAX_STRING_FIELD, 'raw_content');
    const userId = await getJwtUserId(req);
    await assertElderOrFamilyCan(userId, body.elder_id as string, 'alerts');
    const idem = (req.headers.get('idempotency-key') ?? body.idempotency_key) as string | undefined;
    const result = await withIdempotency({
      key: idem,
      functionName: 'fn-scam-pipeline',
      elderId: body.elder_id as string,
      profileId: userId,
      requestBody: body,
      run: async () => {
        const scored = scoreScam(String(body.raw_content));
        const db = admin();
        const signalHash = await sha256(String(body.signal_reference));
        const rawHash = await sha256(String(body.raw_content));
        const { data: event, error } = await db.from("scam_events").insert({
          elder_id: body.elder_id,
          contact_id: body.contact_id,
          channel: body.channel,
          signal_reference_hashed: signalHash,
          raw_content_hash: rawHash,
          threat_types: scored.threat_types,
          alert_level: scored.alert_level,
          score_composite: scored.score,
          score_reputation: scored.layer_scores.reputation,
          score_pattern: scored.layer_scores.pattern,
          score_nlp_intent: scored.layer_scores.nlp_intent,
          score_longitudinal: scored.layer_scores.longitudinal,
          explanation_nl: scored.alert_level === "none" ? "Dit contact lijkt normaal." : "Dit contact gebruikt patronen die vaak voorkomen bij oplichting. Geef geen codes of geld door.",
          explanation_en: scored.alert_level === "none" ? "This contact looks normal." : "This contact uses patterns often seen in scams. Do not share codes or money.",
          family_notified: ["rood", "zwart"].includes(scored.alert_level),
          family_notified_at: ["rood", "zwart"].includes(scored.alert_level) ? new Date().toISOString() : null,
        }).select().single();
        if (error) throw error;
        if (["rood", "zwart"].includes(scored.alert_level)) {
          const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true).eq("notify_on_scam_rood", true);
          await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id as string, notification_type: scored.alert_level === "zwart" ? "scam_zwart" : "scam_rood", title_nl: "HAVEN veiligheidsmelding", title_en: "HAVEN safety alert", body_nl: "Er is een mogelijk fraudepatroon gezien. Bel rustig even mee.", body_en: "A possible scam pattern was seen. Please calmly check in.", data: { scam_event_id: event.id } })));
        }
        return { body: { scam_event_id: event.id, alert_level: scored.alert_level, composite_score: scored.score, layer_scores: scored.layer_scores, explanation_nl: event.explanation_nl, explanation_en: event.explanation_en, family_notified: event.family_notified } };
      },
    });
    await recordMetric("fn-scam-pipeline", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await captureException(e, { fn: 'fn-scam-pipeline' });
    await recordMetric("fn-scam-pipeline", started, "error");
    return errorResponse(e, req);
  }
});
