import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["elder_id", "sender_id", "sender_role", "message_type"]);
    const db = admin();
    const { data: msg, error } = await db.from("family_messages").insert({
      elder_id: body.elder_id,
      sender_id: body.sender_id,
      sender_role: body.sender_role,
      message_type: body.message_type,
      content_nl: body.content_nl,
      content_en: body.content_en,
      storage_path: body.storage_path,
      duration_seconds: body.duration_seconds,
    }).select().single();
    if (error) throw error;
    const recipient = body.sender_id === body.elder_id ? body.recipient_id : body.elder_id;
    if (recipient) await dispatchNotification({ recipient_id: recipient, elder_id: body.elder_id, notification_type: "familiebericht", title_nl: "Nieuw familiebericht", title_en: "New family message", body_nl: "Er staat een warm bericht klaar in HAVEN.", body_en: "A warm message is ready in HAVEN.", data: { message_id: msg.id } });
    await recordMetric("fn-family-message-send", started, "success");
    return json({ success: true, message_id: msg.id });
  } catch (e) {
    await recordMetric("fn-family-message-send", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
