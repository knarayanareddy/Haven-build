import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

export function json(body: unknown, status = 200, req?: Request) {
  const extraHeaders: Record<string, string> = {};
  if (req) Object.assign(extraHeaders, corsHeaders(req));
  Object.assign(extraHeaders, securityHeaders);
  return new Response(JSON.stringify(body), {
    status,
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

export async function recordMetric(fn_name: string, started: number, status: "success" | "error" | "fallback") {
  try {
    await admin().from("perf_metrics").insert({ fn_name, duration_ms: Date.now() - started, status, env: Deno.env.get("HAVEN_ENV") ?? "production" });
  } catch (_) {
    console.log(JSON.stringify({ fn_name, status, duration_ms: Date.now() - started, metric: "local-log" }));
  }
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
  const { data: note, error } = await db.from("notifications").insert(params).select().single();
  if (error) throw error;
  const { data: tokens } = await db.from("push_tokens").select("token").eq("profile_id", params.recipient_id).eq("is_active", true);
  if (!tokens?.length) {
    await db.from("notifications").update({ sent_at: new Date().toISOString(), send_error: "no_active_token" }).eq("id", note.id);
    return note;
  }
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const pushPayload = tokens.map((t: { token: string }) => ({ to: t.token, title: params.title_nl, body: params.body_nl, data: params.data ?? {}, sound: "default" }));
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
      await db.from("notifications").update({ sent_at: new Date().toISOString(), send_error: text.slice(0, 480) }).eq("id", note.id);
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
    }
  } catch (error) {
    await db.from("notifications").update({ sent_at: new Date().toISOString(), send_error: String((error as Error).message ?? error).slice(0, 480) }).eq("id", note.id);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers,
        body: JSON.stringify(pushPayload),
      });
      await db.from("notifications").update({ send_error: null }).eq("id", note.id);
    } catch (_) { /* swallow — already recorded send_error above */ }
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
          params.body_nl,
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
