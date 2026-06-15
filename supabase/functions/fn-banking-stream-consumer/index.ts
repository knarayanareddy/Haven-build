import { admin, corsHeaders, json, recordMetric, requireInternalAccess, safeErrorMessage, sha256 } from "../_shared/core.ts";
import { captureException } from "../_shared/sentry.ts";

const REDIS_URL = Deno.env.get("UPSTASH_REDIS_URL");
const REDIS_TOKEN = Deno.env.get("UPSTASH_REDIS_TOKEN");
const STREAM_KEY = "haven_psd2_ingress_stream";

interface UnloggedBufferRow {
  id: string;
  integration_key: string;
  raw_payload: string;
  received_at: string;
}

interface RedisStreamEntry {
  id: string;
  fieldValues: Array<string>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);

    const db = admin();
    const receiptsToInsert: Array<Record<string, unknown>> = [];
    const pgIdsToDel: string[] = [];
    const redisIdsToAck: string[] = [];

    // ─── 1. Drain Upstash Redis Stream ───
    if (REDIS_URL && REDIS_TOKEN) {
      try {
        const streamRes = await fetch(`${REDIS_URL}/xread/block/0/count/500/streams/${STREAM_KEY}/0-0`, {
          method: "GET",
          headers: { authorization: `Bearer ${REDIS_TOKEN}` },
        });

        if (streamRes.ok) {
          const jsonRes = await streamRes.json();
          const streams = jsonRes.result as Array<{ name: string; entries: Array<RedisStreamEntry> }> | null;
          const entries = streams?.[0]?.entries ?? [];

          for (const entry of entries) {
            try {
              // Parse key values from Upstash JSON field array
              let intKey = "psd2_stream";
              let rawPayload = "{}";
              let rcvAt = new Date().toISOString();

              const fv = entry.fieldValues ?? [];
              for (let idx = 0; idx < fv.length; idx += 2) {
                if (fv[idx] === "integration_key") intKey = fv[idx + 1];
                if (fv[idx] === "payload") rawPayload = fv[idx + 1];
                if (fv[idx] === "received_at") rcvAt = fv[idx + 1];
              }

              const bodyHash = await sha256(rawPayload);
              const parsed = JSON.parse(rawPayload) as Record<string, unknown>;

              receiptsToInsert.push({
                id: crypto.randomUUID(),
                integration_key: intKey,
                signature_valid: true,
                event_type: String(parsed.event_type ?? "psd2_transfer"),
                body_hash: bodyHash,
                profile_id: parsed.profile_id ?? parsed.elder_id ?? "00000000-0000-0000-0000-000000000001",
                elder_id: parsed.elder_id ?? parsed.profile_id ?? "00000000-0000-0000-0000-000000000001",
                received_at: rcvAt,
              });

              redisIdsToAck.push(entry.id);
            } catch (err) {
              await captureException(err, { fn: "fn-banking-stream-consumer", context: "redis_parse", entry_id: entry.id });
              redisIdsToAck.push(entry.id);
            }
          }
        }
      } catch (redisDrainErr) {
        await captureException(redisDrainErr, { fn: "fn-banking-stream-consumer", context: "redis_drain_timeout" });
      }
    }

    // ─── 2. Drain Unlogged PostgreSQL Buffer Table ───
    const { data: bufferRows } = await db
      .from("psd2_webhook_ingress_buffer")
      .select("*")
      .order("received_at", { ascending: true })
      .limit(500);

    const rows = bufferRows as UnloggedBufferRow[] ?? [];
    for (const row of rows) {
      try {
        const bodyHash = await sha256(row.raw_payload);
        const parsed = JSON.parse(row.raw_payload) as Record<string, unknown>;

        receiptsToInsert.push({
          id: row.id,
          integration_key: row.integration_key,
          signature_valid: true,
          event_type: String(parsed.event_type ?? "psd2_transfer"),
          body_hash: bodyHash,
          profile_id: parsed.profile_id ?? parsed.elder_id ?? "00000000-0000-0000-0000-000000000001",
          elder_id: parsed.elder_id ?? parsed.profile_id ?? "00000000-0000-0000-0000-000000000001",
          received_at: row.received_at,
        });

        pgIdsToDel.push(row.id);
      } catch (err) {
        await captureException(err, { fn: "fn-banking-stream-consumer", context: "pg_parse", buffer_id: row.id });
        pgIdsToDel.push(row.id);
      }
    }

    // ─── 3. Multi-Row Bulk Batch Insertion into Operational Receipts Ledger ───
    if (receiptsToInsert.length > 0) {
      const { error: insErr } = await db.from("webhook_receipts").insert(receiptsToInsert);
      if (insErr) throw insErr;
    }

    // ─── 4. Acknowledge and Purge Processed Buffers ───
    if (pgIdsToDel.length > 0) {
      const { error: delErr } = await db.from("psd2_webhook_ingress_buffer").delete().in("id", pgIdsToDel);
      if (delErr) throw delErr;
    }

    if (redisIdsToAck.length > 0 && REDIS_URL && REDIS_TOKEN) {
      await fetch(`${REDIS_URL}/xdel/${STREAM_KEY}/${redisIdsToAck.join("/")}`, {
        method: "POST",
        headers: { authorization: `Bearer ${REDIS_TOKEN}` },
      });
    }

    await recordMetric("fn-banking-stream-consumer", started, "success");
    return json({ 
      ok: true, 
      total_processed: receiptsToInsert.length, 
      redis_drained: redisIdsToAck.length, 
      pg_drained: pgIdsToDel.length 
    }, 200, req);
  } catch (error) {
    await captureException(error, { fn: "fn-banking-stream-consumer" });
    await recordMetric("fn-banking-stream-consumer", started, "error");
    return json({ ok: false, error: safeErrorMessage(error) }, 500, req);
  }
});
