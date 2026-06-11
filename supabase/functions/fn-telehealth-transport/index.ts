import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "action"]);
    const db = admin();
    if (body.action === "create_appointment") {
      requireFields(body, ["title_nl", "starts_at"]);
      const { data, error } = await db.from("appointments").insert({ elder_id: body.elder_id, title_nl: body.title_nl, title_en: body.title_en ?? body.title_nl, provider_name: body.provider_name, provider_phone: body.provider_phone, location_label: body.location_label, starts_at: body.starts_at, ends_at: body.ends_at, is_medical: Boolean(body.is_medical), created_by_id: body.created_by_id }).select().single();
      if (error) throw error;
      await recordMetric("fn-telehealth-transport", started, "success");
      return json({ success: true, appointment_id: data.id });
    }
    if (body.action === "request_transport") {
      requireFields(body, ["appointment_id", "pickup_label", "destination_label", "pickup_time"]);
      const { data, error } = await db.from("transport_requests").insert({ elder_id: body.elder_id, appointment_id: body.appointment_id, requested_by_id: body.requested_by_id, pickup_label: body.pickup_label, destination_label: body.destination_label, pickup_time: body.pickup_time, status: "requested" }).select().single();
      if (error) throw error;
      const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true);
      await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id, notification_type: "systeem", title_nl: "Vervoer gevraagd", title_en: "Transport requested", body_nl: "Er is hulp met vervoer gevraagd voor een afspraak.", body_en: "Help with transport was requested for an appointment.", data: { transport_request_id: data.id } })));
      await recordMetric("fn-telehealth-transport", started, "success");
      return json({ success: true, transport_request_id: data.id });
    }
    if (body.action === "start_telehealth") {
      requireFields(body, ["provider_type"]);
      const { data, error } = await db.from("telehealth_sessions").insert({ elder_id: body.elder_id, initiated_by_id: body.initiated_by_id, provider_type: body.provider_type, provider_name: body.provider_name, provider_phone: body.provider_phone, medication_brief_read: Boolean(body.medication_brief_read), notes_nl: body.notes_nl, notes_en: body.notes_en }).select().single();
      if (error) throw error;
      await recordMetric("fn-telehealth-transport", started, "success");
      return json({ success: true, telehealth_session_id: data.id });
    }
    throw new Error("Unsupported telehealth or transport action");
  } catch (e) {
    await recordMetric("fn-telehealth-transport", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
