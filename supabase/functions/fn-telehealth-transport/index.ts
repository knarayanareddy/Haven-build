import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertActorMatches, assertElderOrFamilyCan, assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', action: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    const action = String(body.action);

    if (action === "create_appointment") {
      if (!body.title_nl || !body.starts_at) throw new Error('title_nl and starts_at are required');
      if (body.created_by_id) assertActorMatches(userId, String(body.created_by_id), 'created_by_id');
      assertSelf(userId, String(body.elder_id), 'appointment');
      const { data, error } = await userClient(req).from("appointments").insert({ elder_id: userId, title_nl: body.title_nl, title_en: body.title_en ?? body.title_nl, provider_name: body.provider_name, provider_phone: body.provider_phone, location_label: body.location_label, starts_at: body.starts_at, ends_at: body.ends_at, is_medical: Boolean(body.is_medical), created_by_id: userId }).select().single();
      if (error) throw error;
      await recordMetric("fn-telehealth-transport", started, "success");
      return json({ success: true, appointment_id: data.id });
    }

    if (action === "request_transport") {
      if (!body.appointment_id || !body.pickup_label || !body.destination_label || !body.pickup_time) throw new Error('appointment_id, pickup_label, destination_label and pickup_time are required');
      if (userId !== body.elder_id) await assertElderOrFamilyCan(userId, String(body.elder_id), 'medications');
      const { data, error } = await userClient(req).from("transport_requests").insert({ elder_id: body.elder_id, appointment_id: body.appointment_id, requested_by_id: userId, pickup_label: body.pickup_label, destination_label: body.destination_label, pickup_time: body.pickup_time, status: "requested" }).select().single();
      if (error) throw error;
      const { data: family } = await admin().from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id, notification_type: "systeem", title_nl: "Vervoer gevraagd", title_en: "Transport requested", body_nl: "Er is hulp met vervoer gevraagd voor een afspraak.", body_en: "Help with transport was requested for an appointment.", data: { transport_request_id: data.id } })));
      await recordMetric("fn-telehealth-transport", started, "success");
      return json({ success: true, transport_request_id: data.id, requested_by_id: userId });
    }

    if (action === "start_telehealth") {
      if (!body.provider_type) throw new Error('provider_type is required');
      if (body.initiated_by_id) assertActorMatches(userId, String(body.initiated_by_id), 'initiated_by_id');
      assertSelf(userId, String(body.elder_id), 'telehealth session');
      const { data, error } = await userClient(req).from("telehealth_sessions").insert({ elder_id: userId, initiated_by_id: userId, provider_type: body.provider_type, provider_name: body.provider_name, provider_phone: body.provider_phone, medication_brief_read: Boolean(body.medication_brief_read), notes_nl: body.notes_nl, notes_en: body.notes_en }).select().single();
      if (error) throw error;
      await recordMetric("fn-telehealth-transport", started, "success");
      return json({ success: true, telehealth_session_id: data.id });
    }
    throw new Error("Unsupported telehealth or transport action");
  } catch (e) {
    await recordMetric("fn-telehealth-transport", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});