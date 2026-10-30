// ─── Phase 3.2: Shift Handover Summary ───
// Aggregates a care shift summary: visits completed, medications administered,
// incidents reported, handover notes, outstanding tasks, and a recommendation.
//
// Authorization: assertCarerCan(userId, elderId)
// Used by: carer mobile app at shift change

import { admin, corsHeaders, json, readJsonBody, recordMetric, errorResponse } from "../_shared/core.ts";
import { assertCarerCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

interface ShiftSummaryOutput {
  elder_id: string;
  shift_start: string;
  shift_end: string;
  visits_completed: number;
  medications_administered: number;
  incidents_reported: number;
  handover_notes: Array<{
    recorded_at: string;
    appetite: number;
    mood: number;
    mobility: string | null;
    concerns_nl: string | null;
  }>;
  outstanding_tasks: Array<{
    medication_name: string;
    scheduled_time: string;
    status: string;
  }>;
  recommendation: {
    level: "rustig" | "aandacht" | "urgent";
    label_nl: string;
    label_en: string;
    reasons: string[];
  };
}

function computeRecommendation(
  missedMeds: number,
  incidents: number,
  lowMood: boolean,
): ShiftSummaryOutput["recommendation"] {
  const reasons: string[] = [];
  let level: "rustig" | "aandacht" | "urgent" = "rustig";

  if (incidents > 0) { level = "urgent"; reasons.push("incident_gemeld"); }
  else if (missedMeds > 1) { level = "aandacht"; reasons.push("medicatie_gemist"); }
  else if (missedMeds === 1) { if (level === "rustig") level = "aandacht"; reasons.push("medicatie_open"); }
  if (lowMood) { if (level === "rustig") level = "aandacht"; reasons.push("stemming_laag"); }

  const labels: Record<string, { nl: string; en: string }> = {
    rustig:    { nl: "Alles rustig — geen bijzonderheden", en: "All calm — nothing to report" },
    aandacht:  { nl: "Let op — lichte aandachtspunten",    en: "Attention — minor points to note" },
    urgent:    { nl: "Urgent — actie nodig bij volgende bezoek", en: "Urgent — action needed at next visit" },
  };

  return { level, label_nl: labels[level].nl, label_en: labels[level].en, reasons };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-shift-summary");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    const elderId = String(body.elder_id);

    // Authorize: only active, consented carers can view this elder's summary
    await assertCarerCan(userId, elderId);

    const db = admin();
    const shiftStart = body.shift_start
      ? new Date(String(body.shift_start)).toISOString()
      : new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const shiftEnd = body.shift_end
      ? new Date(String(body.shift_end)).toISOString()
      : new Date().toISOString();

    // Parallel fetch all shift data
    const [
      { data: visits, error: vErr },
      { data: notes, error: nErr },
      { data: reminders, error: rErr },
      { data: incidents, error: iErr },
    ] = await Promise.all([
      db.from("carer_visit_logs")
        .select("id, check_in_time, check_out_time")
        .eq("elder_id", elderId)
        .eq("carer_id", userId)
        .gte("check_in_time", shiftStart)
        .lte("check_in_time", shiftEnd)
        .is("deleted_at", null),
      db.from("carer_handover_notes")
        .select("created_at, appetite, mood, mobility, concerns_nl, notes_nl")
        .eq("elder_id", elderId)
        .eq("carer_id", userId)
        .gte("created_at", shiftStart)
        .lte("created_at", shiftEnd)
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("medication_reminders")
        .select("id, medication_id, scheduled_time, status, medications(name_nl)")
        .eq("elder_id", elderId)
        .gte("scheduled_time", shiftStart)
        .lte("scheduled_time", shiftEnd)
        .order("scheduled_time", { ascending: true }),
      db.from("incidents")
        .select("id, severity, summary_nl, created_at")
        .eq("elder_id", elderId)
        .gte("created_at", shiftStart)
        .lte("created_at", shiftEnd)
        .is("deleted_at", null),
    ]);

    if (vErr || nErr || rErr || iErr) {
      throw vErr ?? nErr ?? rErr ?? iErr ?? new Error("Shift summary query failed");
    }

    const medRows = (reminders ?? []) as Array<{ id: string; medication_id: string; scheduled_time: string; status: string; medications?: { name_nl?: string }[] }>;
    const missedMeds = medRows.filter((m) =>
      !["ingenomen", "laat_ingenomen"].includes(m.status)
    ).length;

    const outstanding = medRows
      .filter((m) => !["ingenomen", "laat_ingenomen", "overgeslagen"].includes(m.status))
      .map((m) => ({
        medication_name: m.medications?.[0]?.name_nl ?? m.medication_id,
        scheduled_time: m.scheduled_time,
        status: m.status,
      }));

    const lowMood = (notes ?? []).some((n: Record<string, number>) => (n.mood ?? 3) <= 2);

    const summary: ShiftSummaryOutput = {
      elder_id: elderId,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      visits_completed: (visits ?? []).length,
      medications_administered: medRows.length - missedMeds,
      incidents_reported: (incidents ?? []).length,
      handover_notes: (notes ?? []).map((n: Record<string, unknown>) => ({
        recorded_at: String(n.created_at ?? ""),
        appetite: Number(n.appetite ?? 3),
        mood: Number(n.mood ?? 3),
        mobility: n.mobility ? String(n.mobility) : null,
        concerns_nl: n.concerns_nl ? String(n.concerns_nl) : n.notes_nl ? String(n.notes_nl) : null,
      })),
      outstanding_tasks: outstanding,
      recommendation: computeRecommendation(missedMeds, (incidents ?? []).length, lowMood),
    };

    await recordMetric("fn-shift-summary", started, "success");
    return json({ success: true, summary }, 200, req);
  } catch (e) {
    await recordMetric("fn-shift-summary", started, "error");
    return errorResponse(e, req);
  }
});
