import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
const allowedBuckets = new Set(["voice-notes", "life-story-audio", "life-story-photos", "profile-photos", "document-vault", "ocr-inbox", "tts-cache"]);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["bucket", "path", "operation"]);
    if (!allowedBuckets.has(body.bucket)) throw new Error("Bucket is not allowed");
    const ttl = Math.min(Number(body.ttl_seconds ?? 300), 900);
    const db = admin();
    const storage = db.storage.from(body.bucket);
    if (body.operation === "upload") {
      const { data, error } = await storage.createSignedUploadUrl(body.path);
      if (error) throw error;
      await recordMetric("fn-storage-signed-url", started, "success");
      return json({ success: true, ...data });
    }
    const { data, error } = await storage.createSignedUrl(body.path, ttl);
    if (error) throw error;
    await recordMetric("fn-storage-signed-url", started, "success");
    return json({ success: true, signed_url: data.signedUrl, expires_in: ttl });
  } catch (e) {
    await recordMetric("fn-storage-signed-url", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
