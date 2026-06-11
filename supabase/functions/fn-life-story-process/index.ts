import { admin, cors, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "recording_path"]);
    const db = admin();
    const transcriptNl = body.transcript_nl ?? "Een warme herinnering is opgenomen en veilig opgeslagen.";
    const transcriptEn = body.transcript_en ?? "A warm memory was recorded and stored securely.";
    const { data: story, error } = await db.from("life_stories").insert({ elder_id: body.elder_id, prompt_id: body.prompt_id, title_nl: body.title_nl ?? "Nieuwe herinnering", title_en: body.title_en ?? "New memory", recording_path: body.recording_path, transcript_nl: transcriptNl, transcript_en: transcriptEn, duration_seconds: body.duration_seconds, status: "gereed", keepsake_book_include: Boolean(body.keepsake_book_include) }).select().single();
    if (error) throw error;
    await db.from("companion_memory").insert({ elder_id: body.elder_id, memory_type: "life_event", content_nl: transcriptNl.slice(0, 500), content_en: transcriptEn.slice(0, 500), importance_score: 8, source: "life_story", source_id: story.id });
    await recordMetric("fn-life-story-process", started, "success");
    return json({ success: true, story_id: story.id, status: story.status });
  } catch (e) {
    await recordMetric("fn-life-story-process", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
