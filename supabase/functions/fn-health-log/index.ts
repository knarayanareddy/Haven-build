import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, requireFields, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-health-log");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', kind: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), 'health log');

    const db = userClient(req);
    let result;
    if (body.kind === "hydration") {
      const { data, error } = await db.from("hydration_logs").insert({ elder_id: userId, amount_ml: body.amount_ml ?? 250, source: body.source ?? "voice", notes_nl: body.notes_nl, notes_en: body.notes_en }).select().single();
      if (error) throw error;
      result = data;
    } else if (body.kind === "nutrition") {
      const { data, error } = await db.from("nutrition_logs").insert({ elder_id: userId, meal_label: body.meal_label, description_nl: body.description_nl, description_en: body.description_en, appetite_score: body.appetite_score }).select().single();
      if (error) throw error;
      result = data;
      if (Number(body.appetite_score ?? 5) <= 2) {
        const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", userId).eq("elder_consented", true).eq("is_active", true).eq("notify_on_crisis", true);
        await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: userId, notification_type: "welzijnscheck", title_nl: "Eetlust laag", title_en: "Low appetite", body_nl: "HAVEN merkte een lage eetlust op. Een rustig telefoontje kan fijn zijn.", body_en: "HAVEN noticed low appetite. A calm call may help.", data: { nutrition_log_id: data.id } })));
      }
    } else if (body.kind === "vital") {
      requireFields(body, ["vital_type", "value", "unit"]);
      const threshold = Boolean(body.threshold_flag);
      const { data, error } = await db.from("vital_signs").insert({ elder_id: userId, vital_type: body.vital_type, value: body.value, unit: body.unit, reading_source: body.reading_source ?? "manual", device_name: body.device_name, context_notes_nl: body.context_notes_nl, threshold_flag: threshold }).select().single();
      if (error) throw error;
      result = data;
    } else {
      throw new Error("Unsupported health log kind");
    }
    await recordMetric("fn-health-log", started, "success");
    return json({ success: true, kind: body.kind, record: result });
  } catch (e) {
    await recordMetric("fn-health-log", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});