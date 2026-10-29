import { rateLimit } from "../_shared/ratelimit.ts";
import { admin, corsHeaders, json, readJsonBody, recordMetric, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { asyncWrapper } from "../_shared/async_wrapper.ts";

Deno.serve(asyncWrapper("fn-pending-confirmation-respond", async (req: Request) => {
  const started = Date.now();
  await rateLimit(req, "fn-pending-confirmation-respond");
  const body = await readJsonBody(req) as Record<string, unknown>;
  validateBody(body, { confirmation_id: "uuid", resolution: "boolean" }, { allowUnknown: true });
  const userId = await getJwtUserId(req);

  const result = await withIdempotency({
    key: body.idempotency_key ?? String(body.confirmation_id),
    functionName: "fn-pending-confirmation-respond",
    requestBody: body,
    run: async () => {
      const db = userClient(req);
      const dbAdmin = admin();

      const { data: pending, error: pErr } = await db.from("pending_confirmations")
        .select("*").eq("id", body.confirmation_id).maybeSingle();
      
      if (pErr) throw pErr;
      if (!pending) throw new Error("403: Confirmation token non-existent");
      
      assertSelf(userId, String(pending.elder_id), "elder");

      // Closure Test 3: Expiry handling for pending confirmations
      if (new Date(String(pending.expires_at)).getTime() < Date.now()) {
        await dbAdmin.from("pending_confirmations").update({ status: "expired" }).eq("id", body.confirmation_id);
        throw new Error("403: Pending confirmation token has expired");
      }

      // Idempotency: replay confirmation twice -> only one MAR update
      if (pending.status === "resolved") {
        return { body: { confirmation_id: body.confirmation_id, resolution: Boolean(body.resolution), confirmation_type: pending.confirmation_type, status: "already_resolved" } };
      }

      await db.from("pending_confirmations").update({
        resolution: Boolean(body.resolution),
        resolved_at: new Date().toISOString(),
        status: "resolved",
      }).eq("id", body.confirmation_id);

      // ─── Perform active relational MAR Update ───
      if (pending.confirmation_type === "medication_taken" && body.resolution === true) {
        const reminderId = (pending.payload as Record<string, unknown> ?? {}).medication_reminder_id;
        if (reminderId) {
          await dbAdmin.from("medication_reminders").update({
            status: "ingenomen",
            confirmed_at: new Date().toISOString(),
          }).eq("id", reminderId).is("confirmed_at", null); // Enforce strict idempotency
        }
      }

      if (pending.confirmation_type === "fall_response" && body.resolution === true) {
        await dbAdmin.from("fall_events").update({
          status: "resolved",
          elder_ack_at: new Date().toISOString(),
          resolution_notes: "Elder actively confirmed they are okay.",
        }).eq("id", (pending.payload as Record<string, unknown> ?? {}).fall_event_id ?? "");
      }

      return { body: { confirmation_id: body.confirmation_id, resolution: Boolean(body.resolution), confirmation_type: pending.confirmation_type, status: "resolved" } };
    },
  });

  return json(result.body, result.status ?? 200, req);
}));