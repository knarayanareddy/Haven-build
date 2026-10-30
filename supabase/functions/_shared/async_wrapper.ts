import { corsHeaders, errorResponse, recordMetric } from "./core.ts";
import { captureException } from "./sentry.ts";
import { toHttpError } from "./errors.ts";

/**
 * Wrapper for handlers that build their own Response (webhooks, streaming
 * endpoints, functions with bespoke success shapes).
 *
 * October 2026: the status now comes from _shared/errors.ts. The previous version
 * inferred it by searching the *sanitised* message for the strings "400", "403",
 * "422" and "429" — so an error whose message happened to contain a number was
 * misclassified, and the sanitised copy rarely contained the number at all. It now
 * behaves identically to havenHandler() for the same error.
 */
export function asyncWrapper(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    const started = Date.now();

    try {
      const response = await handler(req);
      await recordMetric(functionName, started, "success").catch(() => undefined);
      return response;
    } catch (error) {
      const http = toHttpError(error);

      // Bounded telemetry flush: never let reporting block the response.
      await Promise.race([
        (async () => {
          await captureException(error, { fn: functionName, error_code: http.code }).catch(() => undefined);
          await recordMetric(functionName, started, "error").catch(() => undefined);
        })(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]).catch(() => undefined);

      return errorResponse(error, req);
    }
  };
}
