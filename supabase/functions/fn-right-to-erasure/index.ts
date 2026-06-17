import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { assertActorMatches, assertSelfOrVerifiedGuardian, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

async function removeStoragePrefix(bucket: string, prefix: string) {
  const db = admin();
  const { data, error } = await db.from('storage.objects').select('name').eq('bucket_id', bucket).like('name', `${prefix}/%`).limit(1000);
  if (error) throw error;
  const names = (data ?? []).map((row) => (row as { name: string }).name).filter(Boolean);
  if (!names.length) return 0;
  const result = await db.storage.from(bucket).remove(names);
  if (result.error) throw result.error;
  return names.length;
}

// ─── P0-6 FIX: Complete table inventory for erasure ───
// Every table containing elder-scoped data MUST be included.
// This list is the SSOT for GDPR erasure coverage.

// Tables soft-deleted (set deleted_at = now) — elder-owned data records
const SOFT_DELETE_TABLES = [
  "elder_profiles",
  "contacts",
  "tasks",
  "family_messages",
  "life_stories",
  "memory_lane_photos",
  "documents",
  "companion_memory",
  "scam_events",
  "location_events",
  "neighbourhood_profiles",
  "financial_accounts",
  "financial_transactions",
  "nutrition_logs",
  "browser_shield_events",
  "care_plans",
  "care_plan_items",
  "appointments",
  "transport_requests",
  "telehealth_sessions",
  "driving_events",
  "wandering_events",
  "wearable_devices",
  "skill_offerings",
  "skill_exchange_matches",
  "legacy_accounts",
  "bereavement_events",
  "grandchild_profiles",
  "medication_ocr_jobs",
  "document_analysis_jobs",
  "fhir_import_jobs",
  "external_care_sync_jobs",
  "medication_refill_events",
  // ─── P0-6 FIX: vNext tables that were missing ───
  "device_health_events",        // may use profile_id instead of elder_id — handled below
  "scam_coaching_sessions",
  "elder_baselines",
  "daily_checkin_schedule",
  "medication_ocr_reviews",
  "medication_interaction_alerts",
  "voice_profiles",              // has family_member_id — handled specially
  "elder_voice_preferences",
  "video_call_sessions",
  "app_events",
  "carer_handover_notes",
  "carer_handover_recipients",   // may not have elder_id directly — handled separately
];

// Tables that are directly deleted (no soft-delete support)
const DIRECT_DELETE_TABLES = [
  "consent_records",
  "wellness_checkins",
  "hydration_logs",
  "cognitive_checkins",
  "safeguarding_reports",
  "device_sessions",             // uses profile_id
  "notification_preferences",    // uses profile_id
  "notifications",               // uses elder_id OR recipient_id
  "call_reputation_lookups",
  "health_record_imports",
  "safety_digests",
  "elder_interest_tags",
  "event_interests",
  "emergency_access_tokens",
  "emergency_profile_access_log",
  "app_events",                  // also uses profile_id
  "idempotency_keys",            // uses elder_id OR profile_id
  // ─── P0-6 FIX: vNext tables ───
  "pending_confirmations",
  "consent_pack_status",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    // P0-4 FIX: rate limit — erasure is a sensitive, heavy operation
    await rateLimit(req, "fn-right-to-erasure");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) throw new Error('Invalid user ID');
    const db = admin();
    await assertSelfOrVerifiedGuardian(db, userId, String(body.elder_id));
    const { data: requestRow, error } = await db
      .from("deletion_requests")
      .insert({ elder_id: userId, requested_by_id: userId, reason: body.reason ?? "user_request", status: "processing" })
      .select()
      .single();
    if (error) throw error;

    const now = new Date().toISOString();

    // ─── P0-15 FIX: Call soft_purge_profile for WGBO tables anonymization ───
    const { error: purgeError } = await db.rpc("soft_purge_profile", { p_target_id: userId });
    if (purgeError) throw purgeError;

    // ─── Phase 1: Soft-delete elder-owned tables (elder_id column) ───
    for (const table of SOFT_DELETE_TABLES) {
      // Try elder_id first; for tables using profile_id, try that too
      const { error: updateError } = await db.from(table).update({ deleted_at: now }).eq("elder_id", userId);
      if (updateError) {
        // Some tables use profile_id instead of elder_id
        const { error: altError } = await db.from(table).update({ deleted_at: now }).eq("profile_id", userId);
        if (altError) throw altError;
      }
    }

    // ─── Phase 2: Voice interactions — nullify PII + soft-delete ───
    const voiceUpdates = [
      db.from("voice_interactions").update({ transcript_nl: null, transcript_en: null, response_text_nl: null, response_text_en: null, deleted_at: now }).eq("elder_id", userId),
      db.from("family_relationships").update({ is_active: false, elder_consented: false, deleted_at: now }).eq("elder_id", userId),
      db.from("carer_relationships").update({ is_active: false, elder_consented: false, deleted_at: now }).eq("elder_id", userId),
    ];
    for (const result of await Promise.all(voiceUpdates)) if (result.error) throw result.error;

    // ─── Phase 3: Direct deletes ───
    const directDeletes = [
      ...DIRECT_DELETE_TABLES.map((table) => db.from(table).delete().eq("elder_id", userId)),
      // Also try profile_id variants
      db.from("device_sessions").delete().eq("profile_id", userId),
      db.from("notification_preferences").delete().eq("profile_id", userId),
      db.from("push_tokens").update({ is_active: false }).eq("profile_id", userId),
      db.from("notifications").delete().eq("recipient_id", userId),
      db.from("app_events").delete().eq("profile_id", userId),
      db.from("idempotency_keys").delete().eq("profile_id", userId),
      // P0-6 FIX: voice_profiles linked to elder's family members
      db.from("voice_profiles").delete().eq("elder_id", userId),
    ];
    for (const result of await Promise.all(directDeletes)) if (result.error) throw result.error;

    // P0-6 FIX: carer_handover_recipients — join-based cleanup
    const { data: handoverNotes } = await db.from("carer_handover_notes").select("id").eq("elder_id", userId);
    if (handoverNotes?.length) {
      const noteIds = (handoverNotes as Array<{ id: string }>).map((n) => n.id);
      const { error: recipError } = await db.from("carer_handover_recipients").delete().in("handover_id", noteIds);
      if (recipError) throw recipError;
    }

    // P1-8 FIX: Use safe UUID template literals
    const { error: connectionError } = await db.from("neighbourhood_connections")
      .update({ status: "ended", ended_by: userId, ended_reason_internal: "elder_erasure_request" })
      .or(`initiator_elder_id.eq.${userId},recipient_elder_id.eq.${userId}`);
    if (connectionError) throw connectionError;

    // ─── Phase 4: Storage cleanup ───
    const storageCleanup = {} as Record<string, number>;
    for (const bucket of ["voice-notes", "life-story-audio", "life-story-photos", "profile-photos", "document-vault", "ocr-inbox", "tts-cache"]) {
      storageCleanup[bucket] = await removeStoragePrefix(bucket, userId);
    }

    // ─── Phase 5: Mark deletion request complete ───
    const { error: reqUpdateError } = await db.from("deletion_requests")
      .update({ status: "completed", completed_at: now, confirmation_sent_at: now })
      .eq("id", requestRow.id);
    if (reqUpdateError) throw reqUpdateError;

    await recordMetric("fn-right-to-erasure", started, "success");
    return json({
      success: true,
      deletion_request_id: requestRow.id,
      completed_at: now,
      storage_cleanup: storageCleanup,
      legacy_secret_store_cleanup_required: true,
    }, 200, req);
  } catch (e) {
    await recordMetric("fn-right-to-erasure", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
