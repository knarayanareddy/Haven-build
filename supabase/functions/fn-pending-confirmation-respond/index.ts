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

      // ─── Apply the side effect FIRST, and check it ───
      //
      // The confirmation used to be marked `resolved` *before* the MAR write, and
      // neither write's `{ error }` was inspected. Supabase returns database errors
      // in the result object rather than throwing, so a rejected MAR update left
      // `pending_confirmations.status = 'resolved'` with no dose recorded: the app
      // showed "confirmed", the medication record stayed empty, and the elder was
      // never told. The order is inverted here so a failure aborts the whole
      // resolution and the elder is asked again.
      const payload = (pending.payload as Record<string, unknown> | null) ?? {};

      if (pending.confirmation_type === "medication_taken" && body.resolution === true) {
        const reminderId = payload.medication_reminder_id;
        if (!reminderId) {
          // Nothing to confirm. Recording "resolved" here would have marked a dose
          // as taken against no reminder at all.
          throw Object.assign(
            new Error("This confirmation is not linked to a medication reminder"),
            { status: 409, code: "CONFLICT" },
          );
        }

        const { error: marError, count: marCount } = await dbAdmin
          .from("medication_reminders")
          .update({ status: "ingenomen", confirmed_at: new Date().toISOString() }, { count: "exact" })
          .eq("id", reminderId)
          .is("confirmed_at", null); // Enforce strict idempotency

        if (marError) throw marError;

        // 0 rows affected means the reminder was already confirmed or no longer
        // exists. Both are safe to treat as success, but they must not be silent.
        if (marCount === 0) {
          console.warn(`[fn-pending-confirmation-respond] MAR update matched no row for reminder ${String(reminderId)}`);
        }
      }

      if (pending.confirmation_type === "fall_response" && body.resolution === true) {
        const fallEventId = String(payload.fall_event_id ?? "");
        if (fallEventId) {
          const { error: fallError } = await dbAdmin.from("fall_events").update({
            status: "resolved",
            elder_ack_at: new Date().toISOString(),
            resolution_notes: "Elder actively confirmed they are okay.",
          }).eq("id", fallEventId);
          if (fallError) throw fallError;
        }
      }

      // ─── Only now mark the confirmation resolved ───
      const { error: resolveError } = await db.from("pending_confirmations").update({
        resolution: Boolean(body.resolution),
        resolved_at: new Date().toISOString(),
        status: "resolved",
      }).eq("id", body.confirmation_id);
      if (resolveError) throw resolveError;

      return { body: { confirmation_id: body.confirmation_id, resolution: Boolean(body.resolution), confirmation_type: pending.confirmation_type, status: "resolved" } };
    },
  });

  return json(result.body, result.status ?? 200, req);
}));