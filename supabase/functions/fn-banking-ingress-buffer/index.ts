import { admin, corsHeaders, json, readRequestBody, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { captureException } from "../_shared/sentry.ts";

const REDIS_URL = Deno.env.get("UPSTASH_REDIS_URL");
const REDIS_TOKEN = Deno.env.get("UPSTASH_REDIS_TOKEN");
const STREAM_KEY = "haven_psd2_ingress_stream";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const rawPayload = await readRequestBody(req);
    const integrationKey = req.headers.get("x-haven-integration-key") ?? "psd2_default";

    let redisSuccess = false;

    // 1. Primary Ingestion Path: Ultra-fast Upstash Redis Stream buffering (<2ms WAL-free append)
    if (REDIS_URL && REDIS_TOKEN) {
      try {
        const redisRes = await fetch(`${REDIS_URL}/xadd/${STREAM_KEY}/*`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${REDIS_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ integration_key: integrationKey, payload: rawPayload, received_at: new Date().toISOString() }),
        });

        if (redisRes.ok) {
          redisSuccess = true;
        }
      } catch (redisErr) {
        await captureException(redisErr, { fn: "fn-banking-ingress-buffer", context: "redis_stream_xadd_timeout" });
      }
    }

    // 2. Automated Highly Resilient Fallback Path: Unlogged PostgreSQL Buffer Table
    // If Redis is not configured or times out, write to our 0% WAL Unlogged scratch table
    if (!redisSuccess) {
      const db = admin();
      const { error: pgErr } = await db.from("psd2_webhook_ingress_buffer").insert({
        integration_key: integrationKey,
        raw_payload: rawPayload,
        received_at: new Date().toISOString(),
      });

      if (pgErr) throw pgErr;
    }

    await recordMetric("fn-banking-ingress-buffer", started, "success");
    return json({ ok: true, buffered: true, stream_redis: redisSuccess }, 200, req);
  } catch (error) {
    await captureException(error, { fn: "fn-banking-ingress-buffer" });
    await recordMetric("fn-banking-ingress-buffer", started, "error");
    return json({ ok: false, error: safeErrorMessage(error) }, 500, req);
  }
});
