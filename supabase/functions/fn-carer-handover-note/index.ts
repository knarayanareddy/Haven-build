// ─── Phase 3.3 + 3.4: Photo attachments + medication interaction check at point of care ───
import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertCarerCan, getJwtUserId } from "../_shared/authz.ts";
import { assertMaxLength, MAX_STRING_FIELD, validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import { captureException } from "../_shared/sentry.ts";
import { assertNoBsnInPayload, scrubBsnFromLogs } from "../_shared/bsn_guard.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  let rawBodyPayload: unknown = null;
  try {
    await rateLimit(req, "fn-carer-handover-note");
    const body = await readJsonBody(req) as Record<string, unknown>;
    rawBodyPayload = body;

    // ─── Authoritative Server-Side BSN Guard ───
    // Directly blocks BSN variants (digits, delimited, spaces, zero-width)
    // with 422 before any processing or relational writing.
    assertNoBsnInPayload(body); // Enforces assertNoBsnText properties fundamentally

    validateBody(body, { elder_id: "uuid", appetite: "number", mood: "number" }, { allowUnknown: true });

    const userId = await getJwtUserId(req);
    await assertCarerCan(userId, String(body.elder_id));

    if (body.notes_nl || body.notes_en) {
      assertMaxLength(String(body.notes_nl ?? ""), MAX_STRING_FIELD, "notes_nl");
    }
    if (body.concerns_nl || body.concerns_en) {
      assertMaxLength(String(body.concerns_nl ?? ""), MAX_STRING_FIELD, "concerns_nl");
    }

    const photoPaths: string[] = Array.isArray(body.photo_paths) ? body.photo_paths.filter((p): p is string => typeof p === "string") : [];
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
        let interactionAlerts: InteractionRule[] = [];
        const administeredMedicationId = body.administered_medication_id
          ? String(body.administered_medication_id)
          : null;

        const db = userClient(req);
        if (administeredMedicationId) {
          const dbAdmin = admin();
          const { data: adminMed } = await dbAdmin
            .from("medications")
            .select("name_nl")
            .eq("id", administeredMedicationId)
            .maybeSingle();

          if (adminMed?.name_nl) {
            const { data: activeMeds } = await db
              .from("medications")
              .select("name_nl")
              .eq("elder_id", body.elder_id)
              .eq("is_active", true)
              .neq("id", administeredMedicationId);

            const activeNames = (activeMeds ?? []).map((m) => String(m.name_nl));
            interactionAlerts = findInteractions(adminMed.name_nl, activeNames);

            if (interactionAlerts.length > 0) {
              await db.from("medication_interaction_alerts").insert({
                elder_id: body.elder_id,
                medication_ids: [administeredMedicationId],
                severity: interactionAlerts.some((a) => a.severity === "critical")
                  ? "critical"
                  : "warn",
                summary_nl: interactionAlerts.map((a) => a.summary_nl).join(" "),
                summary_en: interactionAlerts.map((a) => a.summary_en).join(" "),
                source: "fn-carer-handover-note",
              });
            }
          }
        }

        const { data: note, error: insertError } = await db
          .from("carer_handover_notes")
          .insert({
            elder_id: body.elder_id,
            carer_id: userId,
            appetite: Number(body.appetite),
            mood: Number(body.mood),
            mobility: body.mobility ? String(body.mobility) : null,
            concerns_nl: body.concerns_nl ? String(body.concerns_nl) : null,
            concerns_en: body.concerns_en ? String(body.concerns_en) : null,
            notes_nl: body.notes_nl ? String(body.notes_nl) : null,
            notes_en: body.notes_en ? String(body.notes_en) : null,
            photo_paths: photoPaths,
            administered_medication_id: administeredMedicationId,
            administered_at: body.administered_at ? String(body.administered_at) : null,
          })
          .select()
          .single();

        if (insertError) throw insertError;

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
  } catch (error) {
    const isBsnErr = (error as { isBsnViolation?: boolean }).isBsnViolation;
    const status = (error as { status?: number }).status ?? 400;
    const cleanErr = isBsnErr ? "422: Prohibited Dutch Citizen Service Number (BSN) detected." : safeErrorMessage(error);

    // Scrubber helper absolutely removes 9-digit BSN candidates from logged items
    const scrubbedBody = scrubBsnFromLogs(rawBodyPayload);
    await captureException(new Error(cleanErr), { fn: "fn-carer-handover-note", payload: scrubbedBody });
    await recordMetric("fn-carer-handover-note", started, "error");
    return json({ error: cleanErr }, isBsnErr ? 422 : status, req);
  }
});
