import { corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

function assertOwnedRecordingPath(userId: string, recordingPath: string) {
  const ownerId = recordingPath.split('/').filter(Boolean)[0] ?? '';
  if (!ownerId) throw new Error('recording_path must include an owner folder');
  if (ownerId !== userId) throw new Error('recording_path must belong to the authenticated elder');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', recording_path: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'life story');
    assertOwnedRecordingPath(userId, String(body.recording_path));

    const db = userClient(req);
    const transcriptNl = body.transcript_nl ?? "Een warme herinnering is opgenomen en veilig opgeslagen.";
    const transcriptEn = body.transcript_en ?? "A warm memory was recorded and stored securely.";
    const { data: story, error } = await db.from("life_stories").insert({ elder_id: userId, prompt_id: body.prompt_id, title_nl: body.title_nl ?? "Nieuwe herinnering", title_en: body.title_en ?? "New memory", recording_path: body.recording_path, transcript_nl: transcriptNl, transcript_en: transcriptEn, duration_seconds: body.duration_seconds, status: "gereed", keepsake_book_include: Boolean(body.keepsake_book_include) }).select().single();
    if (error) throw error;
    const { error: memoryError } = await db.from("companion_memory").insert({ elder_id: userId, memory_type: "life_event", content_nl: transcriptNl.slice(0, 500), content_en: transcriptEn.slice(0, 500), importance_score: 8, source: "life_story", source_id: story.id });
    if (memoryError) throw memoryError;
    await recordMetric("fn-life-story-process", started, "success");
    return json({ success: true, story_id: story.id, status: story.status });
  } catch (e) {
    await recordMetric("fn-life-story-process", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});