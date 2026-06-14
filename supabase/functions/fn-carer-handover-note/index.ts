// ─── Phase 3.3 + 3.4: Photo attachments + medication interaction check at point of care ───
import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertCarerCan, getJwtUserId } from "../_shared/authz.ts";
import { assertMaxLength, assertNoBsnText, MAX_STRING_FIELD, validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

// ─── Phase 3.4: Inline medication interaction checker ───
// Mirrors the rules from fn-medication-interactions-check but runs locally
// to avoid network round-trip latency at point of care.

interface InteractionRule {
  drugs: [string, string];
  severity: "info" | "warn" | "critical";
  summary_nl: string;
  summary_en: string;
}

const INTERACTION_RULES: InteractionRule[] = [
  { drugs: ["metformine", "lisinopril"], severity: "info", summary_nl: "Geen bekende interactie.", summary_en: "No known interaction." },
  { drugs: ["metformine", "alcohol"], severity: "warn", summary_nl: "Alcohol kan risico op lactaatacidose verhogen.", summary_en: "Alcohol may increase lactic acidosis risk." },
  { drugs: ["lisinopril", "kalium"], severity: "warn", summary_nl: "Kalium kan risico op hyperkaliëmie verhogen.", summary_en: "Potassium may increase hyperkalemia risk." },
  { drugs: ["simvastatine", "amiodaron"], severity: "critical", summary_nl: "Combinatie verhoogt risico op myopathie.", summary_en: "Combination increases myopathy risk." },
  { drugs: ["metformine", "furosemide"], severity: "info", summary_nl: "Geen interactie van klinisch belang.", summary_en: "No clinically important interaction." },
  { drugs: ["lisinopril", "spironolacton"], severity: "warn", summary_nl: "Kaliumsparende diuretica + ACE-remmer: monitor kalium.", summary_en: "K-sparing diuretic + ACE inhibitor: monitor potassium." },
  { drugs: ["metformine", "prednison"], severity: "warn", summary_nl: "Corticosteroïden kunnen bloedsuiker verhogen.", summary_en: "Corticosteroids may increase blood sugar." },
  { drugs: ["carbamazepine", "simvastatine"], severity: "critical", summary_nl: "Carbamazepine verlaagt simvastatine-spiegel.", summary_en: "Carbamazepine reduces simvastatin levels." },
];

function findInteractions(administeredMedName: string, allActiveMedNames: string[]): InteractionRule[] {
  const lower = [administeredMedName.toLowerCase(), ...allActiveMedNames.map((m) => m.toLowerCase())];
  return INTERACTION_RULES.filter((rule) => {
    const [a, b] = rule.drugs;
    return lower.some((m) => m.includes(a)) && lower.some((m) => m.includes(b));
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-carer-handover-note");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid", appetite: "number", mood: "number" }, { allowUnknown: true });

    const userId = await getJwtUserId(req);
    await assertCarerCan(userId, String(body.elder_id));

    // BSN rejection on all free-text fields
    if (body.notes_nl || body.notes_en) {
      assertNoBsnText(body.notes_nl ?? "");
      assertNoBsnText(body.notes_en ?? "");
      assertMaxLength(String(body.notes_nl ?? ""), MAX_STRING_FIELD, "notes_nl");
    }
    if (body.concerns_nl || body.concerns_en) {
      assertNoBsnText(body.concerns_nl ?? "");
      assertNoBsnText(body.concerns_en ?? "");
      assertMaxLength(String(body.concerns_nl ?? ""), MAX_STRING_FIELD, "concerns_nl");
    }

    // ─── Phase 3.3: Validate photo paths ───
    const photoPaths: string[] = Array.isArray(body.photo_paths) ? body.photo_paths.filter((p): p is string => typeof p === "string") : [];
    // Reject directory traversal in photo paths
    for (const path of photoPaths) {
      if (path.includes("..") || path.includes("\\")) throw new Error("Invalid photo path");
    }

    const idem = (req.headers.get("idempotency-key") ?? body.idempotency_key) as string | undefined;
    const result = await withIdempotency({
      key: idem,
      functionName: "fn-carer-handover-note",
      elderId: body.elder_id as string,
      profileId: userId,
      requestBody: body,
      run: async () => {
        // ─── Phase 3.4: Run medication interaction check if medication is being administered ───
        let interactionAlerts: InteractionRule[] = [];
        const administeredMedicationId = body.administered_medication_id
          ? String(body.administered_medication_id)
          : null;

        const db = userClient(req);
        if (administeredMedicationId) {
          // Fetch the administered medication name
          const { data: med } = await db.from("medications")
            .select("name_nl, name_en")
            .eq("id", administeredMedicationId)
            .maybeSingle();

          if (med) {
            // Fetch all active medications for this elder
            const { data: allMeds } = await db.from("medications")
              .select("name_nl, name_en")
              .eq("elder_id", body.elder_id)
              .is("deleted_at", null)
              .eq("is_active", true);

            const allNames = (allMeds ?? []).flatMap((m) => [m.name_nl, m.name_en].filter(Boolean));
            const medName = (med as { name_nl: string; name_en: string | null }).name_nl;
            interactionAlerts = findInteractions(medName, allNames as string[]);

            // Persist any critical/warning interactions
            if (interactionAlerts.length > 0) {
              const dbAdmin = admin();
              for (const alert of interactionAlerts) {
                await dbAdmin.from("medication_interaction_alerts").insert({
                  elder_id: body.elder_id,
                  medication_ids: [administeredMedicationId],
                  severity: alert.severity,
                  summary_nl: alert.summary_nl,
                  summary_en: alert.summary_en,
                  source: "carer_handover_v1",
                });
              }
            }
          }
        }

        // ─── Phase 3.3: Insert handover note with photo_paths (plural) ───
        const { data: note, error } = await db.from("carer_handover_notes").insert({
          elder_id: body.elder_id,
          carer_id: userId,
          visit_id: body.visit_id ?? null,
          appetite: Math.max(1, Math.min(5, Number(body.appetite))),
          mood: Math.max(1, Math.min(5, Number(body.mood))),
          mobility: body.mobility ?? null,
          concerns_nl: body.concerns_nl ?? null,
          concerns_en: body.concerns_en ?? null,
          notes_nl: body.notes_nl ?? null,
          notes_en: body.notes_en ?? null,
          photo_paths: photoPaths.length > 0 ? photoPaths : null,
          administered_medication_id: administeredMedicationId,
          administered_at: body.administered_at ?? null,
        }).select().single();
        if (error) throw error;

        // Add family recipients
        const recipients: string[] = Array.isArray(body.family_recipient_ids)
          ? body.family_recipient_ids
          : [];
        for (const rid of recipients) {
          await db.from("carer_handover_recipients")
            .insert({ handover_id: note.id, family_member_id: rid })
            .catch(() => undefined);
        }

        return {
          body: {
            handover_id: note.id,
            recipients_added: recipients.length,
            appetite: note.appetite,
            mood: note.mood,
            photos_attached: photoPaths.length,
            interaction_alerts: interactionAlerts.length > 0
              ? interactionAlerts.map((a) => ({
                  severity: a.severity,
                  summary_nl: a.summary_nl,
                }))
              : [],
            interaction_warning: interactionAlerts.some((a) => a.severity === "critical")
              ? "CRITICAL: Medicijninteractie gedetecteerd. Raadpleeg arts."
              : interactionAlerts.some((a) => a.severity === "warn")
              ? "Let op: mogelijke medicijninteractie."
              : null,
          },
        };
      },
    });

    await recordMetric("fn-carer-handover-note", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-carer-handover-note", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
