import { corsHeaders, errorResponse, json, readJsonBody, recordMetric } from "./core.ts";
import { rateLimit } from "./ratelimit.ts";
import { captureException } from "./sentry.ts";
import { toHttpError } from "./errors.ts";

/**
 * P0-1+P0-3+P0-4 FIX: Standardised secure handler wrapper for all Edge Functions.
 * Automatically provides:
 *  - Dynamic CORS + security headers on every response
 *  - Sanitised error messages (never leaks internals)
 *  - Rate limiting with per-function identity tracking
 *  - Request body size enforcement via readJsonBody
 *  - Sentry error capture on failures
 *  - Consistent OPTIONS preflight handling
 *
 * October 2026: error handling delegates to _shared/errors.ts. This wrapper
 * previously answered 400 for every failure, which discarded AuthzError's 403 and
 * RateLimitBreachError's 429/Retry-After and made the contract useless to clients
 * that need to tell "wrong token" apart from "slow down".
 */
export function havenHandler(
  fnName: string,
  handler: (req: Request, body: Record<string, unknown>) => Promise<{ status?: number; body: unknown }>,
) {
  return Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    const started = Date.now();

    try {
      // P0-4: rate limit before any processing (cheap rejection of floods)
      await rateLimit(req, fnName);
      const body = await readJsonBody(req) as Record<string, unknown>;
      const result = await handler(req, body);
      await recordMetric(fnName, started, "success");
      return json(result.body, result.status ?? 200, req);
    } catch (e) {
      const http = toHttpError(e);
      await captureException(e, { fn: fnName, error_code: http.code, status: http.status });
      await recordMetric(fnName, started, "error");
      return errorResponse(e, req);
    }
  });
}
