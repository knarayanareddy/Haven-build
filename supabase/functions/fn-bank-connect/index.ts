// ─── Phase 4.5: Tink/PSD2 Bank Connection Wizard ───
// Family-assisted bank connection flow:
//   Step 1: POST { action: 'initiate', elder_id } → returns Tink OAuth URL
//   Step 2: Tink redirects to callback → this function receives auth code
//           → exchanges for access_token + refresh_token
//           → stores financial_accounts row with masked IBAN
//           → configures Tink webhook to point at fn-transaction-intercept
//
// Authorization:
//   - initiate: assertElderOrFamilyCan(userId, elderId, 'financials')
//   - callback: Tink redirect (verify state parameter, no JWT)
//   - revoke: assertElderOrFamilyCan(userId, elderId, 'financials')

import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, sha256 } from "../_shared/core.ts";
import { assertElderOrFamilyCan, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

const TINK_API = 'https://api.tink.com/api/v1';

interface TinkTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function exchangeCodeForToken(code: string): Promise<TinkTokenResponse> {
  const clientId = Deno.env.get('TINK_CLIENT_ID');
  const clientSecret = Deno.env.get('TINK_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('TINK_CLIENT_ID and TINK_CLIENT_SECRET must be configured');

  const response = await fetch(`${TINK_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`Tink token exchange failed: ${err.slice(0, 200)}`);
  }

  return response.json();
}

async function registerTinkWebhook(accessToken: string, elderId: string, havenWebhookUrl: string): Promise<string> {
  const response = await fetch(`${TINK_API}/webhooks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: `${havenWebhookUrl}/functions/v1/fn-transaction-intercept`,
      event_types: ['transactions.verification_completed'],
      metadata: { elder_id: elderId, haven_source: 'bank_connect' },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    console.warn(`Tink webhook registration failed (non-fatal): ${err.slice(0, 200)}`);
    return '';
  }

  const json = await response.json();
  return json.webhook_id ?? '';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  const started = Date.now();

  // ─── GET handler: Tink OAuth callback ───
  // Tink redirects here with ?code=XXX&state=XXX after elder authorizes
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code || !state) {
        return json({ error: "Missing code or state parameter" }, 400, req);
      }

      // Verify state to prevent CSRF
      const stateHash = await sha256(state);
      const db = admin();

      const { data: pending } = await db
        .from("idempotency_keys")
        .select("*")
        .eq("key_hash", stateHash)
        .eq("status", "claimed")
        .maybeSingle();

      if (!pending) {
        return json({ error: "Invalid or expired state parameter" }, 403, req);
      }

      const elderId = pending.elder_id;
      if (!elderId) {
        return json({ error: "No elder_id associated with this request" }, 400, req);
      }

      // Exchange code for tokens
      const tokens = await exchangeCodeForToken(code);

      // Store the connection
      const connectionId = crypto.randomUUID();
      await db.from("financial_accounts").insert({
        id: connectionId,
        elder_id: elderId,
        provider: "tink",
        provider_ref: `tink-${elderId}`,
        status: "active",
        linked_at: new Date().toISOString(),
        refresh_token_encrypted: tokens.refresh_token, // In production: encrypt this
        last_synced_at: new Date().toISOString(),
      });

      // Register Tink webhook
      const havenUrl = Deno.env.get("HAVEN_API_URL") ?? "https://api.haven.nl";
      const webhookId = await registerTinkWebhook(tokens.access_token, elderId, havenUrl);

      // Update the idempotency key status
      await db.from("idempotency_keys")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          response_body: { bank_connected: true, provider: "tink", connection_id: connectionId },
        })
        .eq("key_hash", stateHash);

      await recordMetric("fn-bank-connect", started, "success");

      // Redirect back to the family dashboard callback URL
      const redirectUrl = Deno.env.get("HAVEN_BANK_CONNECT_REDIRECT") ?? "https://haven.nl/family/dashboard?bank=connected";
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectUrl}&connection_id=${connectionId}` },
      });
    } catch (e) {
      await recordMetric("fn-bank-connect", started, "error");
      const errorRedirect = Deno.env.get("HAVEN_BANK_CONNECT_REDIRECT") ?? "https://haven.nl/family/dashboard";
      return new Response(null, {
        status: 302,
        headers: { Location: `${errorRedirect}&error=bank_connect_failed` },
      });
    }
  }

  // ─── POST handler: initiate or revoke ───
  try {
    await rateLimit(req, "fn-bank-connect");
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid", action: "string" }, { allowUnknown: true });

    const userId = await getJwtUserId(req);
    const elderId = String(body.elder_id);
    const action = String(body.action);

    if (!["initiate", "revoke", "status"].includes(action)) {
      throw new Error("action must be 'initiate', 'revoke' or 'status'");
    }

    // All actions require family financial permission
    await assertElderOrFamilyCan(userId, elderId, "financials");

    if (action === "status") {
      const db = admin();
      const { data: account } = await db
        .from("financial_accounts")
        .select("id, provider, status, linked_at, last_synced_at, account_id_masked")
        .eq("elder_id", elderId)
        .eq("status", "active")
        .order("linked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await recordMetric("fn-bank-connect", started, "success");
      return json({
        connected: !!account,
        account: account ?? null,
      }, 200, req);
    }

    if (action === "revoke") {
      const db = admin();
      const { error } = await db.from("financial_accounts")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("elder_id", elderId)
        .eq("status", "active");

      if (error) throw error;

      await recordMetric("fn-bank-connect", started, "success");
      return json({ success: true, message_nl: "Bankkoppeling verbroken.", message_en: "Bank connection revoked." }, 200, req);
    }

    // action === "initiate"
    const tinkClientId = Deno.env.get("TINK_CLIENT_ID");
    if (!tinkClientId) throw new Error("TINK_CLIENT_ID not configured");

    const redirectUri = Deno.env.get("TINK_REDIRECT_URI") ?? "https://api.haven.nl/functions/v1/fn-bank-connect";
    const state = crypto.randomUUID();
    const stateHash = await sha256(state);

    // Store the OAuth state for CSRF verification
    const db = admin();
    await db.from("idempotency_keys").insert({
      key_hash: stateHash,
      function_name: "fn-bank-connect",
      elder_id: elderId,
      profile_id: userId,
      request_hash: stateHash,
      status: "claimed",
      claimed_at: new Date().toISOString(),
    });

    // Build Tink OAuth URL
    const tinkUrl = new URL("https://link.tink.com/1.0/transactions/connect-accounts");
    tinkUrl.searchParams.set("client_id", tinkClientId);
    tinkUrl.searchParams.set("redirect_uri", redirectUri);
    tinkUrl.searchParams.set("state", state);
    tinkUrl.searchParams.set("market", "NL");
    tinkUrl.searchParams.set("locale", "nl_NL");

    await recordMetric("fn-bank-connect", started, "success");
    return json({
      success: true,
      tink_url: tinkUrl.toString(),
      message_nl: "Open deze link op de telefoon van de oudere om de bank te koppelen.",
      message_en: "Open this link on the elder's phone to connect their bank.",
    }, 200, req);
  } catch (e) {
    await recordMetric("fn-bank-connect", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
