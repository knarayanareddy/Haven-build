import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertCarerCan, assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-fall-event");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, {
      elder_id: "uuid",
      detection_source: "string",
    }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    if (body.detection_source === "carer") {
      await assertCarerCan(userId, String(body.elder_id));
    } else {
      assertSelf(userId, String(body.elder_id), "elder");
    }

    const confidence = Math.max(0, Math.min(1, Number(body.confidence ?? 0.5)));
    const idem = req.headers.get("idempotency-key") ?? body.idempotency_key ?? body.client_event_id;

    const result = await withIdempotency({
      key: idem,
      functionName: "fn-fall-event",
      elderId: body.elder_id,
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        const { data: fall, error } = await db.from("fall_events").insert({
          elder_id: body.elder_id,
          device_session_id: body.device_session_id ?? null,
          wearable_device_id: body.wearable_device_id ?? null,
          detection_source: body.detection_source,
          confidence,
          status: "possible",
        }).select().single();
        if (error) throw error;

        // Trigger "Are you OK?" prompt: write a pending_confirmations row.
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await db.from("pending_confirmations").insert({
          elder_id: body.elder_id,
          confirmation_type: "fall_response",
          payload: { fall_event_id: fall.id, detection_source: body.detection_source, confidence },
          expires_at: expiresAt,
        });

        // Note: actual push to the elder's device is queued by the scheduled job
        // fn-fall-escalation which polls fall_events.status = 'possible'.
        return { body: { fall_event_id: fall.id, status: "possible", confirmation_required_until: expiresAt, message: "Please confirm you are okay." } };
      },
    });

    await recordMetric("fn-fall-event", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-fall-event", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});