import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";

interface InteractionRule {
  drugs: [string, string];
  severity: "info" | "warn" | "critical";
  summary_nl: string;
  summary_en: string;
}

const RULES: InteractionRule[] = [
  { drugs: ["metformine", "lisinopril"], severity: "info", summary_nl: "Geen bekende interactie tussen Metformine en Lisinopril.", summary_en: "No known interaction between Metformin and Lisinopril." },
  { drugs: ["metformine", "alcohol"], severity: "warn", summary_nl: "Alcohol kan het risico op lactaatacidose bij Metformine verhogen.", summary_en: "Alcohol may increase the risk of lactic acidosis with Metformin." },
  { drugs: ["lisinopril", "kalium"], severity: "warn", summary_nl: "Kaliumsupplementen kunnen het risico op hyperkaliëmie met Lisinopril verhogen.", summary_en: "Potassium supplements can increase the risk of hyperkalemia with Lisinopril." },
  { drugs: ["simvastatine", "amiodaron"], severity: "critical", summary_nl: "Combinatie van Simvastatine en Amiodaron kan het risico op myopathie verhogen.", summary_en: "Combination of Simvastatin and Amiodarone can increase the risk of myopathy." },
  { drugs: ["metformine", "furosemide"], severity: "info", summary_nl: "Geen interactie van klinisch belang tussen Metformine en Furosemide.", summary_en: "No clinically important interaction between Metformin and Furosemide." },
];

function findMatches(meds: string[]): InteractionRule[] {
  const lower = meds.map((m) => String(m ?? "").toLowerCase());
  const out: InteractionRule[] = [];
  for (const rule of RULES) {
    const [a, b] = rule.drugs;
    if (lower.some((m) => m.includes(a)) && lower.some((m) => m.includes(b))) out.push(rule);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), "elder");

    const idem = req.headers.get("idempotency-key") ?? body.idempotency_key;
    const result = await withIdempotency({
      key: idem,
      functionName: "fn-medication-interactions-check",
      elderId: body.elder_id,
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        const { data: meds } = await db.from("medications")
          .select("id, name_nl, name_en, brand_name_nl")
          .eq("elder_id", body.elder_id)
          .is("deleted_at", null)
          .eq("is_active", true);
        const medNames = (meds ?? []).flatMap((m) => [m.name_nl, m.name_en, m.brand_name_nl].filter(Boolean));
        const matches = findMatches(medNames as string[]);
        const ids = (meds ?? []).map((m) => m.id);
        for (const match of matches) {
          await db.from("medication_interaction_alerts").insert({
            elder_id: body.elder_id,
            medication_ids: ids,
            severity: match.severity,
            summary_nl: match.summary_nl,
            summary_en: match.summary_en,
            source: "mock_rules_v1",
          });
        }
        return { body: { matches_count: matches.length, matches, provider: "mock_rules_v1" } };
      },
    });

    await recordMetric("fn-medication-interactions-check", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-medication-interactions-check", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});