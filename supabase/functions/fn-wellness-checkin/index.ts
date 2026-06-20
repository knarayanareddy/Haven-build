import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-wellness-checkin");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, {
      elder_id: "uuid",
      checkin_type: "string",
    }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), "elder");

    const mood = (body.mood_score === null || body.mood_score === undefined) ? null : Math.max(1, Math.min(5, Number(body.mood_score)));
    const energy = (body.energy_score === null || body.energy_score === undefined) ? null : Math.max(1, Math.min(5, Number(body.energy_score)));
    const pain = (body.pain_score === null || body.pain_score === undefined) ? null : Math.max(1, Math.min(5, Number(body.pain_score)));
    const idem = req.headers.get("idempotency-key") ?? body.idempotency_key ?? body.client_event_id;

    const result = await withIdempotency({
      key: idem,
      functionName: "fn-wellness-checkin",
      elderId: body.elder_id,
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        const { data: checkin, error } = await db.from("wellness_checkins").insert({
          elder_id: body.elder_id,
          mood_score: mood,
          energy_score: energy,
          pain_score: pain,
          notes_nl: body.notes_nl ?? null,
          notes_en: body.notes_en ?? null,
          voice_note_path: body.voice_note_path ?? null,
          checkin_type: body.checkin_type,
          captured_via: body.captured_via ?? "voice",
        }).select().single();
        if (error) throw error;

        // Pattern detection: 3 consecutive "morning" check-ins with mood <= 2 → calm family notification.
        let escalate = false;
        if (body.checkin_type === "morning" && mood !== null && mood <= 2) {
          const { data: recent } = await db.from("wellness_checkins")
            .select("mood_score")
            .eq("elder_id", body.elder_id)
            .eq("checkin_type", "morning")
            .order("checked_in_at", { ascending: false })
            .limit(3);
          if ((recent ?? []).filter((r) => r.mood_score !== null && r.mood_score <= 2).length >= 3) escalate = true;
        }

        if (escalate) {
          const dbAdmin = admin();
          const { data: family } = await dbAdmin.from("family_relationships")
            .select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true).eq("notify_on_crisis", true);
          for (const f of family ?? []) {
            await dispatchNotification({
              recipient_id: f.family_member_id,
              elder_id: body.elder_id,
              notification_type: "welzijnscheck",
              title_nl: "Stemming — check even in",
              title_en: "Mood — please check in",
              body_nl: "Een aantal ochtenden was wat minder. Bel rustig even, zonder druk.",
              body_en: "A few mornings were a little low. Please call calmly, no pressure.",
              data: { wellness_checkin_id: checkin.id },
            });
          }
        }

        return { body: { wellness_checkin_id: checkin.id, family_notified: escalate, recorded: { mood, energy, pain } } };
      },
    });

    await recordMetric("fn-wellness-checkin", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-wellness-checkin", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});