import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}

export function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service configuration is missing");
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
  const text = raw.toLowerCase();
  const rules = [
    { key: "bank", score: 14, type: "bankhelpdeskfraude" },
    { key: "pin", score: 18, type: "bankhelpdeskfraude" },
    { key: "code", score: 14, type: "phishing" },
    { key: "urgent", score: 14, type: "andere" },
    { key: "meteen", score: 14, type: "andere" },
    { key: "gift card", score: 28, type: "phishing" },
    { key: "cadeaukaart", score: 28, type: "phishing" },
    { key: "do not tell", score: 24, type: "andere" },
    { key: "vertel niemand", score: 24, type: "andere" },
    { key: "remote", score: 20, type: "phishing" },
    { key: "anydesk", score: 28, type: "phishing" },
  ];
  const hits = rules.filter((r) => text.includes(r.key));
  const score = Math.min(100, hits.reduce((sum, r) => sum + r.score, 0));
  const threatTypes = [...new Set(hits.map((h) => h.type))];
  const level = score >= 90 ? "zwart" : score >= 70 ? "rood" : score >= 40 ? "amber" : "none";
  return {
    score,
    alert_level: level,
    threat_types: threatTypes.length ? threatTypes : ["andere"],
    layer_scores: {
      reputation: Math.min(100, Math.round(score * 0.55)),
      pattern: Math.min(100, Math.round(score * 0.95)),
      nlp_intent: Math.min(100, Math.round(score * 0.75)),
      longitudinal: Math.min(100, Math.round(score * 0.35)),
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

export async function dispatchNotification(params: {
  recipient_id: string;
  elder_id?: string;
  notification_type: string;
  title_nl: string;
  title_en?: string;
  body_nl: string;
  body_en?: string;
  data?: Record<string, string>;
}) {
  const db = admin();
  const { data: note, error } = await db.from("notifications").insert(params).select().single();
  if (error) throw error;
  const { data: tokens } = await db.from("push_tokens").select("token").eq("profile_id", params.recipient_id).eq("is_active", true);
  if (tokens?.length) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: params.title_nl, body: params.body_nl, data: params.data ?? {}, sound: "default" }))),
    });
    await db.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", note.id);
  }
  return note;
}
