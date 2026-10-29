import { admin, corsHeaders, json, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";

const REDIS_URL = Deno.env.get("UPSTASH_REDIS_URL");
const REDIS_TOKEN = Deno.env.get("UPSTASH_REDIS_TOKEN");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    // Fulfilling secure internal access verification gate
    requireInternalAccess(req);
    const db = admin();

    // 1. Database Connection & Relational Pool Reachability Check
    // Supabase builders are PromiseLike only: `.catch` does not exist on them.
    const dbPromise = Promise.resolve(
      db.from("profiles").select("id", { count: "exact", head: true })
        .then((res) => ({ ok: !res.error, error: res.error ? res.error.message : null })),
    ).catch((err: unknown) => ({ ok: false, error: safeErrorMessage(err) }));

    // 2. Upstash Redis Stream Reachability Check
    const redisPromise = (async () => {
      if (!REDIS_URL || !REDIS_TOKEN) return { ok: false, error: "Missing Upstash Redis Credentials" };
      try {
        const res = await fetch(`${REDIS_URL}/get/haven_health_check_ping`, {
          headers: { authorization: `Bearer ${REDIS_TOKEN}` },
        });
        return { ok: res.ok, error: res.ok ? null : `HTTP ${res.status} ${res.statusText}` };
      } catch (err) {
        return { ok: false, error: safeErrorMessage(err) };
      }
    })();

    // 3. OpenAI API Reachability Check
    const openaiPromise = (async () => {
      if (!OPENAI_API_KEY) return { ok: false, error: "Missing OpenAI API Key" };
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
        });
        return { ok: res.ok, error: res.ok ? null : `HTTP ${res.status} ${res.statusText}` };
      } catch (err) {
        return { ok: false, error: safeErrorMessage(err) };
      }
    })();

    // 4. ElevenLabs API Reachability Check
    const elevenPromise = (async () => {
      if (!ELEVENLABS_API_KEY) return { ok: false, error: "Missing ElevenLabs API Key" };
      try {
        const res = await fetch("https://api.elevenlabs.io/v1/models", {
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
        });
        return { ok: res.ok, error: res.ok ? null : `HTTP ${res.status} ${res.statusText}` };
      } catch (err) {
        return { ok: false, error: safeErrorMessage(err) };
      }
    })();

    // 5. Critical pg_cron jobs — freshness of the canonical retention sweeper
    //
    // This used to read `perf_metrics`, which `recordMetric()` writes on every
    // request and which no cron job ever touches, so the check measured traffic
    // rather than the sweeper. Worse, `maybeSingle()` reports failure in
    // `{ error }` instead of throwing, so a failed or empty query fell through to
    // `new Date(Date.now() - 3600000)` + `status: "healthy"` — a fabricated
    // timestamp asserting that the GDPR retention sweeper was running. It now
    // reads the real run history (public.cron_job_health, migration
    // 20261029000003), fails closed, and enforces the staleness window.
    const SWEEPER_JOB = "haven-database-retention-r5";
    const SWEEPER_MAX_AGE_MS = 26 * 60 * 60 * 1000; // daily at 03:00 + 2h slack
    const cronPromise = (async () => {
      try {
        const { data, error } = await db.from("cron_job_health")
          .select("jobname, status, start_time, end_time, return_message")
          .eq("jobname", SWEEPER_JOB)
          .maybeSingle();

        if (error) {
          // 42P01 = undefined_table: pg_cron (and therefore the view) is not
          // installed in this environment. That is "not applicable", not
          // "healthy" — say so instead of inventing a pass.
          const isMissingView = error.code === "42P01";
          return {
            ok: isMissingView,
            last_cron_sweep: null,
            status: isMissingView ? "not_applicable" : "error",
            error: isMissingView ? "pg_cron not installed; retention sweeper not scheduled" : safeErrorMessage(error),
          };
        }

        if (!data) {
          return {
            ok: false,
            last_cron_sweep: null,
            status: "missing",
            error: `Job ${SWEEPER_JOB} is not scheduled`,
          };
        }

        const lastRun = data.start_time ? new Date(data.start_time) : null;
        const ageMs = lastRun ? Date.now() - lastRun.getTime() : Number.POSITIVE_INFINITY;
        const fresh = ageMs <= SWEEPER_MAX_AGE_MS;
        const failed = data.status !== "succeeded";

        return {
          ok: fresh && !failed,
          last_cron_sweep: data.start_time ?? null,
          last_cron_end: data.end_time ?? null,
          age_hours: Number.isFinite(ageMs) ? Math.round(ageMs / 360000) / 10 : null,
          status: failed ? "failed" : fresh ? "healthy" : "stale",
          error: failed
            ? `Last run ended with status ${String(data.status)}: ${String(data.return_message ?? "").slice(0, 200)}`
            : fresh ? null : `Last run was ${Math.round(ageMs / 3600000)}h ago (max 26h)`,
        };
      } catch (err) {
        return { ok: false, last_cron_sweep: null, status: "error", error: safeErrorMessage(err) };
      }
    })();

    const [dbCheck, redisCheck, openaiCheck, elevenCheck, cronCheck] = await Promise.all([
      dbPromise, redisPromise, openaiPromise, elevenPromise, cronPromise,
    ]);

    // A stalled retention sweeper is a compliance regression (data kept past its
    // GDPR window), so it degrades health rather than being reported alongside a
    // 200. `not_applicable` is the only state that does not count against it.
    const cronIsApplicable = cronCheck.status !== "not_applicable";
    const isCompletelyHealthy = dbCheck.ok && (redisCheck.ok || !REDIS_URL) && (cronCheck.ok || !cronIsApplicable);
    const statusCode = isCompletelyHealthy ? 200 : 503;

    await recordMetric("fn-health-check", started, isCompletelyHealthy ? "success" : "slo_breach");

    return json({
      success: isCompletelyHealthy,
      status: isCompletelyHealthy ? "ok" : "degraded",
      checks: {
        database: dbCheck,
        redis: redisCheck,
        openai: openaiCheck,
        elevenlabs: elevenCheck,
        pg_cron_sweeper: cronCheck,
      },
      duration_ms: Date.now() - started,
      timestamp: new Date().toISOString(),
    }, statusCode, req);

  } catch (error) {
    await recordMetric("fn-health-check", started, "error");
    return json({ success: false, status: "error", error: safeErrorMessage(error) }, 500, req);
  }
});
