import { admin, dispatchNotification, json, readRequestBody, recordMetric, requireFields, sha256, userClient } from "../_shared/core.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { captureException } from "../_shared/sentry.ts";
import { settleQuery } from "../_shared/settle.ts";
import { verifyHmacSha256 } from "../_shared/webhook.ts";
import { asyncWrapper } from "../_shared/async_wrapper.ts";
import { toHttpError } from "../_shared/errors.ts";

/**
 * PSD2 transaction interception webhook.
 *
 * Ordering was inverted, which made this the highest-risk endpoint in the repo: the
 * `catch` block ran on *every* failure — including `403: Invalid PSD2 webhook
 * signature` — and it (a) marked the transaction `intercept_failed`, (b) wrote an
 * audit row, and (c) dispatched a `scam_zwart` notification to every consented family
 * member **and every admin**. An unauthenticated attacker could therefore fan out
 * unlimited notifications by POSTing garbage, and needed no secret at all.
 *
 * It also inserted `financial_transactions` *before* `withIdempotency`, so every retry
 * of the same bank event left another `processing` row behind.
 *
 * Current ordering:
 *   1. read + parse the body (no writes on failure);
 *   2. authenticate — internal key, or HMAC over the raw body — and record the
 *      receipt. Unauthenticated calls get 401/403 with **no** side effects;
 *   3. require the fields;
 *   4. insert + evaluate inside the idempotent block, so a duplicate delivery
 *      resolves to one transaction row;
 *   5. only a *verified* failure after persistence escalates to family and admins.
 */

type WebhookAuth = { kind: 'internal' } | { kind: 'hmac'; signatureValid: true } | { kind: 'local-bypass' };

Deno.serve(asyncWrapper("fn-transaction-intercept", async (req: Request) => {
  const started = Date.now();
  const db = admin();

  // ─── 1. Parse. Nothing is written before authentication succeeds. ───
  const raw = await readRequestBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('Malformed JSON body'), { status: 400, code: 'BAD_REQUEST' });
  }
  const elderId = body.elder_id ? String(body.elder_id) : '';

  // ─── 2. Authenticate ───
  const isInternalCall = Boolean(req.headers.get('x-haven-internal-key') || req.headers.get('x-internal-key'));
  const secret = Deno.env.get('PSD2_WEBHOOK_SECRET');
  const isLocal = Deno.env.get('HAVEN_ENV') === 'local' || Deno.env.get('ENVIRONMENT') === 'local';

  let auth: WebhookAuth;
  if (isInternalCall) {
    const { requireInternalAccess } = await import("../_shared/internal.ts");
    requireInternalAccess(req); // throws 403 for a bad key — before any write
    auth = { kind: 'internal' };
  } else if (secret) {
    const signatureValid = await verifyHmacSha256(
      raw,
      req.headers.get('x-haven-signature') ?? req.headers.get('x-tink-signature'),
      secret,
    );
    // The receipt is the *only* write an unauthenticated call may cause: it is a
    // fixed-size forensic row, and it carries no fan-out.
    await settleQuery(
      db.from('webhook_receipts').insert({
        integration_key: 'psd2',
        signature_valid: signatureValid,
        body_hash: await sha256(raw),
        event_type: 'transaction',
      }),
      'webhook_receipts.insert:psd2',
    );
    if (!signatureValid) {
      await recordMetric("fn-transaction-intercept", started, "error");
      throw Object.assign(new Error('Invalid PSD2 webhook signature'), { status: 403, code: 'FORBIDDEN' });
    }
    auth = { kind: 'hmac', signatureValid: true };
  } else if (isLocal) {
    auth = { kind: 'local-bypass' };
  } else {
    // No secret configured: refuse rather than accept unauthenticated traffic.
    throw Object.assign(
      new Error('PSD2_WEBHOOK_SECRET must be configured for non-local transaction webhooks'),
      { status: 503, code: 'SERVICE_UNAVAILABLE' },
    );
  }

  if (auth.kind === 'internal') {
    await settleQuery(
      db.from('webhook_receipts').insert({
        integration_key: 'psd2',
        signature_valid: null,
        body_hash: await sha256(raw),
        event_type: 'transaction_internal',
      }),
      'webhook_receipts.insert:psd2-internal',
    );
  }

  // ─── 3. Validate the payload of an authenticated caller ───
  requireFields(body, ["elder_id", "account_id_masked", "amount_cents", "transaction_date"]);
  const idem = (req.headers.get('idempotency-key') ?? body.idempotency_key ?? body.raw_reference) as string | undefined;
  const amount = Number(body.amount_cents);
  if (!Number.isFinite(amount)) {
    throw Object.assign(new Error('amount_cents must be a number'), { status: 400, code: 'BAD_REQUEST' });
  }

  const writeTransaction = async (): Promise<string> => {
    const { data, error } = await db.from("financial_transactions").insert({
      elder_id: elderId,
      financial_account_id: body.financial_account_id,
      account_id_masked: body.account_id_masked,
      bank_name: body.bank_name ? String(body.bank_name) : null,
      amount_cents: amount,
      currency: body.currency ? String(body.currency) : "EUR",
      counterparty_name: body.counterparty_name ? String(body.counterparty_name) : null,
      counterparty_iban_masked: body.counterparty_iban_masked ? String(body.counterparty_iban_masked) : null,
      description: body.description ? String(body.description) : null,
      transaction_date: String(body.transaction_date),
      anomaly_score: 0,
      flagged: false,
      intercepted: false,
      intercept_status: 'processing',
      source_provider: body.source_provider ? String(body.source_provider) : "psd2",
      raw_reference_hash: body.raw_reference ? await sha256(String(body.raw_reference)) : null,
      is_internal: isInternalCall,
    }).select().single();
    if (error) throw error;
    return String(data.id);
  };

  // ─── 4. Persist and evaluate exactly once per idempotency key ───
  let txId: string | null = null;
  try {
    const result = await withIdempotency({
      key: idem,
      functionName: 'fn-transaction-intercept',
      elderId,
      requestBody: body,
      run: async () => {
        // The insert lives inside the claim, so a duplicate delivery does not create
        // a second row (and a stuck `processing` row is no longer left per retry).
        txId = await writeTransaction();

        const newPayee = Boolean(body.is_new_payee) || !body.counterparty_iban_masked;
        const anomaly = Math.min(
          100,
          (Math.abs(amount) > Number(body.alert_threshold_cents ?? 20000) ? 45 : 0) + (newPayee ? 35 : 0) + (body.scam_event_id ? 35 : 0),
        );
        const flagged = anomaly >= 70;
        const finalStatus = flagged ? 'flagged' : 'cleared';

        await settleQuery(
          db.from("financial_transactions")
            .update({ anomaly_score: anomaly, flagged, intercepted: flagged, intercept_status: finalStatus })
            .eq("id", txId),
          'financial_transactions.evaluate',
        );

        if (flagged) {
          const { data: family } = await db
            .from("family_relationships")
            .select("family_member_id")
            .eq("elder_id", elderId)
            .eq("elder_consented", true)
            .eq("is_active", true)
            .eq("can_view_financials", true);
          await Promise.all(
            (family ?? []).map((f: { family_member_id: string }) =>
              dispatchNotification({
                recipient_id: String(f.family_member_id),
                elder_id: elderId,
                notification_type: "scam_zwart",
                title_nl: "Ongewone betaling",
                title_en: "Unusual payment",
                body_nl: "HAVEN ziet een ongewone betaling. Bel rustig even mee.",
                body_en: "HAVEN sees an unusual payment. Please calmly check in.",
                data: { transaction_id: txId },
              }),
            ),
          );
        }

        return {
          body: { success: true, transaction_id: txId, anomaly_score: anomaly, flagged, intercepted: flagged, intercept_status: finalStatus },
        };
      },
    });

    await recordMetric("fn-transaction-intercept", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (err) {
    // ─── 5. Verified failure *after* a row exists → escalate. ───
    const http = toHttpError(err);
    await captureException(err, { fn: "fn-transaction-intercept", elder_id: elderId, error_code: http.code });

    // A failure before persistence (e.g. a duplicate-key race) has nothing to flag and
    // must never page every admin.
    if (!txId) {
      await recordMetric("fn-transaction-intercept", started, "error");
      return json({ error: http.message, error_code: http.code, intercept_status: 'not_persisted' }, http.status, req);
    }

    await settleQuery(
      db.from("financial_transactions")
        .update({ intercept_status: 'intercept_failed', flagged: true, intercepted: false })
        .eq("id", txId),
      'financial_transactions.fail',
    );

    await settleQuery(
      db.from("audit_log").insert({
        actor_id: elderId || "00000000-0000-0000-0000-000000000001",
        actor_role: "system",
        action: "PSD2_TRANSACTION_INTERCEPT_FAILURE",
        table_name: "financial_transactions",
        record_id: txId,
        elder_id: elderId || null,
        extra: { reason: "INTERCEPT_FAILURE", error: http.message, timestamp: new Date().toISOString() },
      }),
      'audit_log.insert:psd2-intercept-failure',
    );

    const recipients: string[] = [];
    if (elderId) {
      const { data: family } = await db
        .from("family_relationships")
        .select("family_member_id")
        .eq("elder_id", elderId)
        .eq("elder_consented", true)
        .eq("is_active", true)
        .eq("can_view_financials", true);
      for (const f of family ?? []) if (f.family_member_id) recipients.push(String(f.family_member_id));
    }
    const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
    for (const a of admins ?? []) recipients.push(String(a.id));

    await Promise.allSettled(
      recipients.map((recId) =>
        dispatchNotification({
          recipient_id: recId,
          elder_id: elderId || undefined,
          notification_type: "scam_zwart",
          title_nl: "CRITICAL MISLUKT: Bank Interceptie",
          title_en: "CRITICAL FAILED: Banking Intercept",
          body_nl: `Het controleren van een betaling is mislukt. Controleer de bankrekening direct.`,
          body_en: `Validating a wire transfer failed. Immediate banking review required.`,
          data: { transaction_id: txId, reason: "INTERCEPT_FAILURE" },
        }),
      ),
    );

    await recordMetric("fn-transaction-intercept", started, "error");
    return json({ error: http.message, error_code: http.code, intercept_status: 'intercept_failed' }, http.status, req);
  }
}));
