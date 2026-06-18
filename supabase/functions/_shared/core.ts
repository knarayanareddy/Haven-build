import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { alertLevelFromScore, scoreScamText } from "../../../packages/scam-engine/src/catalog.mjs";

// ─── P0-1 FIX: CORS — dynamic origin validation, not wildcard ───
const ALLOWED_ORIGINS = (Deno.env.get("HAVEN_ALLOWED_ORIGINS") ?? "http://localhost:3000,http://localhost:4173,exp://*,haven://*")
  .split(",")
  .map((s) => s.trim());

function matchOrigin(origin: string | null): string | null {
  if (!origin) return null;
  for (const pattern of ALLOWED_ORIGINS) {
    if (pattern === "*") return "*";
    if (pattern.endsWith("*") && origin.startsWith(pattern.slice(0, -1))) return origin;
    if (pattern === origin) return origin;
  }
  return null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = matchOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowed ?? ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-haven-internal-key, idempotency-key, x-haven-signature, x-tink-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ─── COMPATIBILITY BRIDGE: Deprecated wildcard CORS for gradual migration ───
// 68 remaining Edge Functions still import { cors }. This bridge keeps them
// compiling while they are refactored to corsHeaders(req).
// Replace with corsHeaders(req) in production functions.
export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-haven-internal-key, idempotency-key, x-haven-signature, x-tink-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// P2-1 FIX: Security headers
export const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
};

// P0-3 FIX: sanitize errors — never leak internal details
export function safeErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    const msg = e.message;
    if (
      msg.startsWith("Missing") || msg.startsWith("Invalid") ||
      msg.startsWith("Caller") || msg.startsWith("No active") ||
      msg.includes("is not allowed") || msg.includes("is required") ||
      msg.includes("must be a") || msg.includes("must match") ||
      msg.includes("not accepted") || msg.includes("not configured") ||
      msg.startsWith("Directory traversal") || msg.startsWith("First path") ||
      msg.startsWith("Uploads are only") || msg.startsWith("Document vault") ||
      msg.startsWith("OCR inbox") || msg.startsWith("Bucket is not") ||
      msg.startsWith("operation must") || msg.includes("BSN") ||
      msg.startsWith("Content-Type") || msg.includes("exceeds maximum") ||
      msg.startsWith("Rate limit")
    ) {
      return msg;
    }
    if (msg.includes("JWT") || msg.includes("token")) return "Authentication failed";
    if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("constraint")) return "Resource already exists";
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("RLS")) return "Access denied";
    if (msg.includes("connect") || msg.includes("timeout") || msg.includes("network") || msg.includes("fetch")) return "Service temporarily unavailable";
    if (msg.includes("parse") || msg.includes("JSON") || msg.includes("Unexpected")) return "Invalid request format";
    if (msg.includes("size") || msg.includes("large") || msg.includes("limit")) return "Request too large";
  }
  return "An unexpected error occurred";
}

export function json(body: unknown, status = 200, req?: Request, customHeaders?: Record<string, string>) {
  const extraHeaders: Record<string, string> = {};
  if (req) Object.assign(extraHeaders, corsHeaders(req));
  Object.assign(extraHeaders, securityHeaders);
  if (customHeaders) Object.assign(extraHeaders, customHeaders);

  let finalStatus = status;
  const bodyString = typeof body === "string" ? body : JSON.stringify(body);
  if (bodyString.includes("Rate limit exceeded") || bodyString.includes("429")) {
    finalStatus = 429;
    extraHeaders["Retry-After"] = "60";
  }

  return new Response(JSON.stringify(body), {
    status: finalStatus,
    headers: { ...extraHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

// P1-3 FIX: max body size (1 MB default for JSON, configurable)
const MAX_BODY_SIZE = Number(Deno.env.get("HAVEN_MAX_BODY_BYTES") ?? (1024 * 1024));

export async function readRequestBody(req: Request): Promise<string> {
  const ct = req.headers.get("content-type") ?? "";
  if (req.method === "POST" && req.body && !ct.includes("application/json") && !ct.includes("text/plain") && !ct.includes("multipart/form-data")) {
    throw new Error("Content-Type must be application/json, text/plain, or multipart/form-data");
  }
  const len = req.headers.get("content-length");
  if (len && Number(len) > MAX_BODY_SIZE) throw new Error("Request body exceeds maximum size limit");
  const text = await req.text();
  if (text.length > MAX_BODY_SIZE) throw new Error("Request body exceeds maximum size limit");
  return text;
}

export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await readRequestBody(req);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON in request body");
  }
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function admin() {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function userClient(req: Request) {
  const url = requireEnv("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const authorization = req.headers.get("authorization");
  if (!key) throw new Error("SUPABASE_ANON_KEY is not configured");
  if (!authorization) throw new Error("Missing bearer token");
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

export function publicClient() {
  const url = requireEnv("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!key) throw new Error("SUPABASE_ANON_KEY is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function requireFields<T extends Record<string, unknown>>(body: T, fields: string[]) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length) throw new Error(`Missing required field(s): ${missing.join(", ")}`);
}

export function scoreScam(raw: string) {
  const result = scoreScamText(raw);
  const threatTypes = result.hits.length ? result.hits.map((hit) => {
    if (hit.id.startsWith("NL_BANK")) return "bankhelpdeskfraude";
    if (hit.id.startsWith("NL_PAYMENT") || hit.id.startsWith("NL_REMOTE")) return "phishing";
    return "andere";
  }) : ["andere"];
  return {
    score: result.score,
    alert_level: alertLevelFromScore(result.score),
    threat_types: [...new Set(threatTypes)],
    layer_scores: {
      reputation: Math.min(100, Math.round(result.score * 0.55)),
      pattern: Math.min(100, Math.round(result.score * 0.95)),
      nlp_intent: Math.min(100, Math.round(result.score * 0.75)),
      longitudinal: Math.min(100, Math.round(result.score * 0.35)),
    },
  };
}

export async function recordMetric(fn_name: string, started: number, status: "success" | "error" | "fallback" | "slo_breach") {
  try {
    await admin().from("perf_metrics").insert({ fn_name, duration_ms: Date.now() - started, status, env: Deno.env.get("HAVEN_ENV") ?? "production" });
  } catch (_) {
    console.log(JSON.stringify({ fn_name, status, duration_ms: Date.now() - started, metric: "local-log" }));
  }
}

// ─── FINDING 1 & FINDING 2: BCP47 Strict Equality Guard & Pre-Dispatch Content Validation ───
const SUPPORTED_LOCALES = ['nl-NL', 'en-GB', 'en-US'];

export async function assertSafeLocale(attemptedLocale: unknown, actorId = '00000000-0000-0000-0000-000000000001'): Promise<'nl-NL' | 'en-GB' | 'en-US'> {
  const localeStr = String(attemptedLocale ?? 'nl-NL');
  if (SUPPORTED_LOCALES.includes(localeStr)) {
    return localeStr as 'nl-NL' | 'en-GB' | 'en-US';
  }

  try {
    await admin().from('audit_log').insert({
      actor_id: actorId,
      actor_role: 'system',
      action: 'UNSUPPORTED_LOCALE_WARNING',
      table_name: 'profiles',
      extra: { attempted_locale: localeStr, reason: 'BCP47_STRICT_EQUALITY_FAILED', timestamp: new Date().toISOString() },
    });
  } catch {
    // best-effort
  }

  return 'nl-NL';
}

export function sanitizeTemplateContent(title: string, body: string): { title: string; body: string } {
  let cleanTitle = title.replace(/\{\{.*?\}\}|%\{.*?\}|<.*?>/g, '').trim();
  let cleanBody = body.replace(/\{\{.*?\}\}|%\{.*?\}|<.*?>/g, '').trim();

  const titleInvalid = cleanTitle.length > 65 || cleanTitle !== title;
  const bodyInvalid = cleanBody.length > 240 || cleanBody !== body;

  if (titleInvalid || bodyInvalid || !cleanTitle || !cleanBody) {
    return {
      title: 'HAVEN Veiligheidsmelding',
      body: 'Wij hebben een belangrijke melding geregistreerd. Open de app voor meer details.',
    };
  }

  return { title: cleanTitle, body: cleanBody };
}

// P1-4 FIX: Expo push token required for production push notifications
export async function dispatchNotification(params: {
  recipient_id: string;
  elder_id?: string;
  notification_type: string;
  title_nl: string;
  title_en?: string;
  body_nl: string;
  body_en?: string;
  data?: Record<string, unknown>;
}) {
  const db = admin();

  // 1. Look up the RECIPIENT's profiles.locale from the database
  const { data: recipientProfile } = await db.from("profiles")
    .select("locale")
    .eq("id", params.recipient_id)
    .maybeSingle();

  const recipientLocale = await assertSafeLocale(recipientProfile?.locale, params.recipient_id);
  const isEnglish = recipientLocale === "en-GB" || recipientLocale === "en-US";

  // 2. Compile the notification title and body in the recipient's language
  let compiledTitle = params.title_nl;
  let compiledBody = params.body_nl;

  if (params.notification_type) {
    try {
      const { data: tmpl } = await db.from("notification_templates")
        .select("title, body")
        .eq("template_key", params.notification_type)
        .eq("locale", recipientLocale)
        .maybeSingle();

      if (tmpl?.title && tmpl?.body) {
        compiledTitle = tmpl.title;
        compiledBody = tmpl.body;
      }
    } catch {
      // fallback to props
    }
  }

  if (compiledTitle === params.title_nl && isEnglish) {
    compiledTitle = params.title_en ?? (params.title_nl.includes("Calamiteit") ? "HAVEN Calamity" : params.title_nl);
    compiledBody = params.body_en ?? (params.body_nl.includes("val gedetecteerd") ? "We detected a possible fall." : params.body_nl);
  } else if (!recipientProfile?.locale) {
    compiledTitle = `${params.title_nl} | ${params.title_en ?? "HAVEN Calamity"}`;
    compiledBody = `${params.body_nl} | ${params.body_en ?? "Fall detected"}`;
  }

  const validatedCopy = sanitizeTemplateContent(compiledTitle, compiledBody);
  compiledTitle = validatedCopy.title;
  compiledBody = validatedCopy.body;

  const { data: note, error } = await db.from("notifications").insert({
    ...params,
    title_nl: compiledTitle,
    body_nl: compiledBody,
  }).select().single();
  if (error) throw error;
  const { data: tokens } = await db.from("push_tokens").select("token").eq("profile_id", params.recipient_id).eq("is_active", true);
  if (!tokens?.length) {
    await db.from("notifications").update({ sent_at: new Date().toISOString(), send_error: "no_active_token" }).eq("id", note.id);
    return note;
  }
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const pushPayload = tokens.map((t: { token: string }) => ({ to: t.token, title: compiledTitle, body: compiledBody, data: params.data ?? {}, sound: "default" }));
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (expoToken) headers["authorization"] = `Bearer ${expoToken}`;
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(pushPayload),
    });
    if (response.ok) {
      await db.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", note.id);
    } else {
      const text = await response.text();
      if (text.includes("DeviceNotRegistered") || text.includes("InvalidCredentials")) {
        await db.from("push_tokens").update({ is_active: false }).eq("profile_id", params.recipient_id);
        await db.from("device_health_events").insert({
          profile_id: params.recipient_id,
          severity: "p1",
          event_key: "push_token_invalid",
          message_nl: "Push-token is ongeldig geworden. Vraag de gebruiker opnieuw in te loggen.",
          message_en: "Push token is no longer valid. Ask the user to sign in again.",
          details: { source: "dispatch_notification", error: text.slice(0, 240) },
        });
      }
      throw new Error(text.slice(0, 480));
    }
  } catch (error) {
    const errorStr = String((error as Error).message ?? error);
    await db.from("notifications").update({ sent_at: new Date().toISOString(), send_error: errorStr.slice(0, 480) }).eq("id", note.id);

    // FIX B6: In the push failure catch block, for high-priority types (crisis_gedetecteerd, scam_zwart):
    // invoke fn-whatsapp-webhook as fallback after push failure. Log fallback attempt + outcome to audit_log.
    if (params.notification_type === "crisis_gedetecteerd" || params.notification_type === "scam_zwart") {
      let fallbackOutcome = "failure";
      try {
        const res = await fetch("https://haven.internal/functions/v1/fn-whatsapp-webhook", {
          method: "POST",
          headers: { "content-type": "application/json", "x-haven-internal-key": "haven_internal_cron_secret_2026" },
          body: JSON.stringify({
            action: "send_fallback",
            recipient_id: params.recipient_id,
            elder_id: params.elder_id,
            notification_type: params.notification_type,
            body_nl: compiledBody,
          }),
        });
        if (res.ok) fallbackOutcome = "success";
      } catch {
        fallbackOutcome = "failure";
      }

      await db.from("audit_log").insert({
        actor_id: params.recipient_id,
        actor_role: "system",
        action: "WHATSAPP_FALLBACK_DISPATCH",
        table_name: "notifications",
        record_id: note.id,
        elder_id: params.elder_id ?? null,
        extra: { notification_type: params.notification_type, outcome: fallbackOutcome, error: errorStr, timestamp: new Date().toISOString() },
      });
    }
  }

  // ─── Phase 1.5: WhatsApp fallback for P0/P1 alerts ───
  // If push notification failed and this is a critical alert, try WhatsApp.
  const criticalTypes = new Set([
    "crisis", "scam_rood", "scam_zwart", "scam_amber",
    "crisis_gedetecteerd", "welzijnscheck", "veilige_zone_verlaten",
    "photo_checkin_requested", "photo_checkin_fulfilled"
  ]);
  if (criticalTypes.has(params.notification_type)) {
    try {
      const { data: prefs } = await db
        .from("notification_preferences")
        .select("whatsapp_enabled, whatsapp_phone")
        .eq("profile_id", params.recipient_id)
        .maybeSingle();
      if (prefs?.whatsapp_enabled && prefs?.whatsapp_phone) {
        // Dynamic import to avoid bundling WhatsApp for all FNs
        const { sendWhatsAppMessage } = await import("./whatsapp.ts");
        const elderName = params.data?.elder_name
          ? String(params.data.elder_name)
          : undefined;
        const result = await sendWhatsAppMessage(
          prefs.whatsapp_phone,
          compiledBody,
          elderName,
        );
        if (result.success) {
          await db.from("notifications").update({
            whatsapp_sent: true,
            whatsapp_sent_at: new Date().toISOString(),
          }).eq("id", note.id);
        }
      }
    } catch (_) {
      // WhatsApp fallback is best-effort. Never throw from it.
    }
  }

  return note;
}
