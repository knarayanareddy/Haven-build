import { admin, cors, dispatchNotification, json, recordMetric, requireFields, sha256 } from "../_shared/core.ts";
import { verifyHmacSha256 } from "../_shared/webhook.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const raw = await req.text();
    const secret = Deno.env.get('PSD2_WEBHOOK_SECRET');
    if (secret) {
      const valid = await verifyHmacSha256(raw, req.headers.get('x-haven-signature') ?? req.headers.get('x-tink-signature'), secret);
      await admin().from('webhook_receipts').insert({ integration_key: 'psd2', signature_valid: valid, body_hash: await sha256(raw), event_type: 'transaction' });
      if (!valid) throw new Error('Invalid PSD2 webhook signature');
    }
    const body = JSON.parse(raw);
    requireFields(body, ["elder_id", "account_id_masked", "amount_cents", "transaction_date"]);
    const idem = req.headers.get('idempotency-key') ?? body.idempotency_key ?? body.raw_reference;
    const result = await withIdempotency({
      key: idem,
      functionName: 'fn-transaction-intercept',
      elderId: body.elder_id,
      requestBody: body,
      run: async () => {
        const db = admin();
        const amount = Number(body.amount_cents);
        const newPayee = Boolean(body.is_new_payee) || !body.counterparty_iban_masked;
        const anomaly = Math.min(100, (Math.abs(amount) > Number(body.alert_threshold_cents ?? 20000) ? 45 : 0) + (newPayee ? 35 : 0) + (body.scam_event_id ? 35 : 0));
        const flagged = anomaly >= 70;
        const { data: tx, error } = await db.from("financial_transactions").insert({ elder_id: body.elder_id, financial_account_id: body.financial_account_id, account_id_masked: body.account_id_masked, bank_name: body.bank_name, amount_cents: amount, currency: body.currency ?? "EUR", counterparty_name: body.counterparty_name, counterparty_iban_masked: body.counterparty_iban_masked, description: body.description, transaction_date: body.transaction_date, anomaly_score: anomaly, flagged, linked_scam_event_id: body.scam_event_id, intercepted: flagged, source_provider: body.source_provider ?? "psd2", raw_reference_hash: body.raw_reference ? await sha256(String(body.raw_reference)) : null }).select().single();
        if (error) throw error;
        if (flagged) {
          const { data: family } = await db.from("family_relationships").select("family_member_id").eq("elder_id", body.elder_id).eq("elder_consented", true).eq("is_active", true).eq("can_view_financials", true);
          await Promise.all((family ?? []).map((f) => dispatchNotification({ recipient_id: f.family_member_id, elder_id: body.elder_id, notification_type: "scam_zwart", title_nl: "Ongewone betaling", title_en: "Unusual payment", body_nl: "HAVEN ziet een ongewone betaling. Bel rustig even mee.", body_en: "HAVEN sees an unusual payment. Please calmly check in.", data: { transaction_id: tx.id } })));
        }
        return { body: { success: true, transaction_id: tx.id, anomaly_score: anomaly, flagged, intercepted: flagged } };
      },
    });
    await recordMetric("fn-transaction-intercept", started, "success");
    return json(result.body, result.status ?? 200);
  } catch (e) {
    await captureException(e, { fn: 'fn-transaction-intercept' });
    await recordMetric("fn-transaction-intercept", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
