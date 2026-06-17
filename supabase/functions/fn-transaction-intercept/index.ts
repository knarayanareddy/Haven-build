import { admin, corsHeaders, dispatchNotification, json, readRequestBody, recordMetric, requireFields, safeErrorMessage, sha256 } from "../_shared/core.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { captureException } from "../_shared/sentry.ts";
import { verifyHmacSha256 } from "../_shared/webhook.ts";
import { asyncWrapper } from "../_shared/async_wrapper.ts";

Deno.serve(asyncWrapper("fn-transaction-intercept", async (req: Request) => {
  // COMPENSATING CONTROL — full proxy architecture with hold-and-release is tracked as separate milestone
  const started = Date.now();
  let raw = "";
  let body: Record<string, unknown> = {};
  let elderId = "";
  let txId: string | null = null;
  const db = admin();

  try {
    raw = await readRequestBody(req);
    body = JSON.parse(raw) as Record<string, unknown>;
    elderId = body.elder_id ? String(body.elder_id) : "";

    const isInternalCall = !!(req.headers.get('x-haven-internal-key') || req.headers.get('x-internal-key'));
    const secret = Deno.env.get('PSD2_WEBHOOK_SECRET');
    const isLocal = Deno.env.get('HAVEN_ENV') === 'local' || Deno.env.get('ENVIRONMENT') === 'local';

    if (isInternalCall) {
      const { requireInternalAccess } = await import("../_shared/internal.ts");
      requireInternalAccess(req);
      await db.from('webhook_receipts').insert({
        integration_key: 'psd2', signature_valid: null,
        body_hash: await sha256(raw), event_type: 'transaction_internal',
      });
    } else {
      if (!secret && !isLocal) {
        throw new Error('PSD2_WEBHOOK_SECRET must be configured for non-local transaction webhooks');
      }
      if (secret) {
        const valid = await verifyHmacSha256(raw, req.headers.get('x-haven-signature') ?? req.headers.get('x-tink-signature'), secret);
        await db.from('webhook_receipts').insert({
          integration_key: 'psd2', signature_valid: valid,
          body_hash: await sha256(raw), event_type: 'transaction',
        });
        if (!valid) throw new Error('403: Invalid PSD2 webhook signature');
      }
    }

    requireFields(body, ["elder_id", "account_id_masked", "amount_cents", "transaction_date"]);
    const idem = (req.headers.get('idempotency-key') ?? body.idempotency_key ?? body.raw_reference) as string | undefined;

    // ─── 2. Write initial financial_transactions.intercept_status = 'processing' ───
    const amount = Number(body.amount_cents);
    const { data: initTx, error: initErr } = await db.from("financial_transactions").insert({
      elder_id: elderId, financial_account_id: body.financial_account_id,
      account_id_masked: body.account_id_masked, bank_name: body.bank_name ? String(body.bank_name) : null,
      amount_cents: amount, currency: body.currency ? String(body.currency) : "EUR",
      counterparty_name: body.counterparty_name ? String(body.counterparty_name) : null,
      counterparty_iban_masked: body.counterparty_iban_masked ? String(body.counterparty_iban_masked) : null,
      description: body.description ? String(body.description) : null, transaction_date: String(body.transaction_date),
      anomaly_score: 0, flagged: false, intercepted: false,
      intercept_status: 'processing',
      source_provider: body.source_provider ? String(body.source_provider) : "psd2",
      raw_reference_hash: body.raw_reference ? await sha256(String(body.raw_reference)) : null,
      is_internal: isInternalCall,
    }).select().single();

    if (initErr) throw initErr;
    txId = initTx.id;

    // ─── Execute anomaly evaluation inside withIdempotency ───
    const result = await withIdempotency({
      key: idem,
      functionName: 'fn-transaction-intercept',
      elderId: elderId,
      requestBody: body,
      run: async () => {
        const newPayee = Boolean(body.is_new_payee) || !body.counterparty_iban_masked;
        const anomaly = Math.min(100, (Math.abs(amount) > Number(body.alert_threshold_cents ?? 20000) ? 45 : 0) + (newPayee ? 35 : 0) + (body.scam_event_id ? 35 : 0));
        const flagged = anomaly >= 70;
        const finalStatus = flagged ? 'flagged' : 'cleared';

        await db.from("financial_transactions")
          .update({ anomaly_score: anomaly, flagged, intercepted: flagged, intercept_status: finalStatus })
          .eq("id", txId);

        if (flagged) {
          const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", elderId).eq("elder_consented", true).eq("is_active", true).eq("can_view_financials", true);
          await Promise.all((family ?? []).map((f) => dispatchNotification({
            recipient_id: String(f.family_member_id), elder_id: elderId,
            notification_type: "scam_zwart", title_nl: "Ongewone betaling", title_en: "Unusual payment",
            body_nl: "HAVEN ziet een ongewone betaling. Bel rustig even mee.",
            body_en: "HAVEN sees an unusual payment. Please calmly check in.",
            data: { transaction_id: txId },
          })));
        }
        return { body: { success: true, transaction_id: txId, anomaly_score: anomaly, flagged, intercepted: flagged, intercept_status: finalStatus } };
      },
    });

    await recordMetric("fn-transaction-intercept", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (err) {
    // ─── 1. Never silently swallow errors. On any failure -> immediately escalate ───
    await captureException(err, { fn: "fn-transaction-intercept", elder_id: elderId });
    await recordMetric("fn-transaction-intercept", started, "error");

    const errorStr = String((err as Error)?.message ?? err);

    if (txId) {
      await db.from("financial_transactions")
        .update({ intercept_status: 'intercept_failed', flagged: true, intercepted: false })
        .eq("id", txId).catch(() => undefined);
    }

    // Write to audit_log with reason=INTERCEPT_FAILURE
    await db.from("audit_log").insert({
      actor_id: elderId ? String(elderId) : "00000000-0000-0000-0000-000000000001",
      actor_role: "system",
      action: "PSD2_TRANSACTION_INTERCEPT_FAILURE",
      table_name: "financial_transactions",
      record_id: txId ?? "unknown",
      elder_id: elderId ? String(elderId) : null,
      extra: { reason: "INTERCEPT_FAILURE", error: errorStr, timestamp: new Date().toISOString() },
    }).catch(() => undefined);

    // Dispatch high-priority alert to family delegate AND admin via existing dispatchNotification + WhatsApp fallback
    const recipients: string[] = [];
    if (elderId) {
      const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", elderId).eq("elder_consented", true).eq("is_active", true).eq("can_view_financials", true);
      for (const f of family ?? []) if (f.family_member_id) recipients.push(String(f.family_member_id));
    }
    const { data: admins } = await db.from("profiles").select("id").eq("role", "admin");
    for (const a of admins ?? []) recipients.push(String(a.id));

    await Promise.allSettled(recipients.map((recId) => dispatchNotification({
      recipient_id: recId,
      elder_id: elderId || undefined,
      notification_type: "scam_zwart",
      title_nl: "CRITICAL MISLUKT: Bank Interceptie",
      title_en: "CRITICAL FAILED: Banking Intercept",
      body_nl: `Het controleren van een betaling is mislukt (${errorStr.slice(0, 120)}). Controleer de bankrekening direct.`,
      body_en: `Validating a wire transfer failed (${errorStr.slice(0, 120)}). Immediate banking review required.`,
      data: { transaction_id: txId, reason: "INTERCEPT_FAILURE" },
    })));

    return json({ error: safeErrorMessage(err), intercept_status: 'intercept_failed' }, 400, req);
  }
}));
