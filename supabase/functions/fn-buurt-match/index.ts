import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "action"]);
    const db = admin();
    if (body.action === "send_request") {
      requireFields(body, ["shared_tag_ids"]);
      const { data: me } = await db.from("neighbourhood_profiles").select("postcode_pc4").eq("elder_id", body.elder_id).eq("is_active", true).single();
      const { data: candidates } = await db.from("neighbourhood_profiles").select("elder_id").eq("postcode_pc4", me.postcode_pc4).eq("is_active", true).neq("elder_id", body.elder_id).limit(20);
      const recipient = candidates?.[0];
      if (!recipient) return json({ success: false, new_status: "declined", message_nl: "Er is nu geen passende buurtverbinding gevonden.", message_en: "No suitable neighbourhood connection was found right now." });
      const { data: conn, error } = await db.from("neighbourhood_connections").insert({ initiator_elder_id: body.elder_id, recipient_elder_id: recipient.elder_id, status: "pending_recipient", shared_tag_ids: body.shared_tag_ids, is_walk_buddy_match: Boolean(body.is_walk_buddy), initiator_accepted_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      await dispatchNotification({ recipient_id: recipient.elder_id, elder_id: recipient.elder_id, notification_type: "buurt_verzoek", title_nl: "Buurtverzoek", title_en: "Neighbourhood request", body_nl: "Iemand met gedeelde interesses wil graag kennismaken. Uw naam blijft privé tot u ja zegt.", body_en: "Someone with shared interests would like to connect. Your name stays private until you accept.", data: { connection_id: conn.id } });
      await recordMetric("fn-buurt-match", started, "success");
      return json({ success: true, new_status: "pending_recipient", connection_id: conn.id, message_nl: "Uw verzoek is privé verstuurd.", message_en: "Your private request has been sent." });
    }
    requireFields(body, ["connection_id"]);
    const statusMap: Record<string, string> = { accept_request: "accepted", decline_request: "declined", withdraw_request: "withdrawn", end_connection: "ended" };
    const newStatus = statusMap[String(body.action)];
    if (!newStatus) throw new Error("Unsupported BUURT action");
    const patch: Record<string, string> = { status: newStatus };
    if (body.action === "accept_request") patch.recipient_accepted_at = new Date().toISOString();
    const { data: conn, error } = await db.from("neighbourhood_connections").update(patch).eq("id", body.connection_id).or(`initiator_elder_id.eq.${body.elder_id},recipient_elder_id.eq.${body.elder_id}`).select().single();
    if (error) throw error;
    await recordMetric("fn-buurt-match", started, "success");
    return json({ success: true, new_status: conn.status, message_nl: "Uw keuze is opgeslagen.", message_en: "Your choice has been saved." });
  } catch (e) {
    await recordMetric("fn-buurt-match", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
