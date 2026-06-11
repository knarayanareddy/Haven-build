import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
import { generateEmbedding } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "memory_type", "content"]);
    const db = admin();
    let embedding = null;
    try { embedding = await generateEmbedding(String(body.content)); } catch (_) { embedding = null; }

    if (embedding) {
      const { data: matches } = await db.rpc("match_companion_memory", { p_elder_id: body.elder_id, p_query_embedding: embedding, p_match_threshold: 0.92, p_match_count: 1 });
      if (matches?.[0]) {
        await db.from("companion_memory").update({ last_referenced: new Date().toISOString(), importance_score: Math.max(Number(matches[0].importance_score ?? 5), Number(body.importance_score ?? 5)) }).eq("id", matches[0].id);
        await recordMetric("fn-companion-memory", started, "success");
        return json({ memories_created: 0, memories_updated: 1, memories_skipped: 0, memory_id: matches[0].id });
      }
    } else {
      const { data: existing } = await db.from("companion_memory").select("id, content_nl").eq("elder_id", body.elder_id).eq("memory_type", body.memory_type).is("deleted_at", null).limit(50);
      const duplicate = (existing ?? []).find((m) => String(m.content_nl).toLowerCase() === String(body.content).toLowerCase());
      if (duplicate) {
        await db.from("companion_memory").update({ last_referenced: new Date().toISOString() }).eq("id", duplicate.id);
        await recordMetric("fn-companion-memory", started, "success");
        return json({ memories_created: 0, memories_updated: 1, memories_skipped: 0, memory_id: duplicate.id });
      }
    }

    const { data: row, error } = await db.from("companion_memory").insert({ elder_id: body.elder_id, memory_type: body.memory_type, content_nl: body.content, content_en: body.content_en ?? null, importance_score: body.importance_score ?? 5, source: body.source ?? "voice_interaction", source_id: body.source_interaction_id ?? body.source_story_id ?? null, embedding }).select().single();
    if (error) throw error;
    await recordMetric("fn-companion-memory", started, "success");
    return json({ memories_created: 1, memories_updated: 0, memories_skipped: 0, memory_id: row.id });
  } catch (e) {
    await recordMetric("fn-companion-memory", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
