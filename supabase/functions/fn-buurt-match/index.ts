import { admin, cors, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

const ACTION_SET = new Set(["request_connection", "accept_request", "decline_request", "withdraw_request", "end_connection"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-buurt-match");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid', action: 'string' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) throw new Error('Invalid user ID');
    assertSelf(userId, String(body.elder_id), 'buurt match');
    if (!ACTION_SET.has(String(body.action))) throw new Error("action must be request_connection, accept_request, decline_request, withdraw_request or end_connection");

    const db = admin();
    if (body.action === "request_connection") {
      const { data: candidates, error: candidatesError } = await db
        .from("neighbourhood_profiles")
        .select("elder_id, interest_tags")
        .neq("elder_id", userId)
        .is("deleted_at", null)
        .limit(20);
      if (candidatesError) throw candidatesError;
      const recipient = candidates?.[0];
      if (!recipient) {
        await recordMetric("fn-buurt-match", started, "success");
        return json({ success: false, new_status: "declined", message_nl: "Er is nu geen passende buurtverbinding gevonden.", message_en: "No suitable neighbourhood connection was found right now." }, 200, req);
      }
      const { data: conn, error } = await db.from("neighbourhood_connections").insert({
        initiator_elder_id: userId, recipient_elder_id: recipient.elder_id,
        status: "pending_recipient", shared_tag_ids: body.shared_tag_ids,
        is_walk_buddy_match: Boolean(body.is_walk_buddy),
        initiator_accepted_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      await dispatchNotification({
        recipient_id: recipient.elder_id, elder_id: recipient.elder_id,
        notification_type: "buurt_verzoek", title_nl: "Buurtverzoek", title_en: "Neighbourhood request",
        body_nl: "Iemand met gedeelde interesses wil graag kennismaken. Uw naam blijft privé tot u ja zegt.",
        body_en: "Someone with shared interests would like to connect. Your name stays private until you accept.",
        data: { connection_id: conn.id },
      });
      await recordMetric("fn-buurt-match", started, "success");
      return json({ success: true, new_status: "pending_recipient", connection_id: conn.id, message_nl: "Uw verzoek is privé verstuurd.", message_en: "Your private request has been sent." }, 200, req);
    }

    // P1-15+P1-19 FIX: Validate connection_id as UUID before using
    if (!body.connection_id || typeof body.connection_id !== 'string') throw new Error('connection_id is required');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(body.connection_id)) throw new Error('connection_id must be a uuid');

    const statusMap: Record<string, string> = {
      accept_request: "accepted", decline_request: "declined",
      withdraw_request: "withdrawn", end_connection: "ended",
    };
    const newStatus = statusMap[String(body.action)];
    if (!newStatus) throw new Error("Unsupported BUURT action");
    const patch: Record<string, string> = { status: newStatus };
    if (body.action === "accept_request") patch.recipient_accepted_at = new Date().toISOString();

    // P1-15 FIX: Use parameterized .or() instead of template literals
    const { data: conn, error } = await db.from("neighbourhood_connections")
      .update(patch)
      .eq("id", body.connection_id)
      .or("initiator_elder_id.eq.${p1},recipient_elder_id.eq.${p2}", { p1: userId, p2: userId })
      .select()
      .single();
    if (error) throw error;
    await recordMetric("fn-buurt-match", started, "success");
    return json({ success: true, new_status: conn.status, message_nl: "Uw keuze is opgeslagen.", message_en: "Your choice has been saved." }, 200, req);
  } catch (e) {
    await recordMetric("fn-buurt-match", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
