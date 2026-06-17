import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { getJwtUserId, assertSelfOrVerifiedGuardian } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    await rateLimit(req, "fn-data-export", 5, 60);
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: 'uuid' }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    const db = userClient(req);
    await assertSelfOrVerifiedGuardian(db, userId, String(body.elder_id));
    const { data, error } = await db.rpc("export_elder_data", { p_elder_id: userId });
    if (error) throw error;

    await admin().from("audit_log").insert({
      actor_id: userId,
      actor_role: "elder",
      action: "GDPR_DATA_EXPORT",
      table_name: "profiles",
      record_id: userId,
      elder_id: userId,
      extra: { channel: "api_export", timestamp: new Date().toISOString() },
    }).catch(() => undefined);

    await recordMetric("fn-data-export", started, "success");

    // Basic FHIR-compatible JSON wrapper
    const fhirBundle = {
      resourceType: "Bundle",
      type: "collection",
      timestamp: new Date().toISOString(),
      entry: [
        {
          fullUrl: `urn:uuid:${userId}`,
          resource: {
            resourceType: "Parameters",
            id: "haven-gdpr-export",
            parameter: [
              { name: "verifiable_platform_export", valueJson: data }
            ]
          }
        }
      ]
    };

    return json(fhirBundle, 200, req);
  } catch (e) {
    const errorStr = String((e as Error)?.message ?? e);
    const status = errorStr.includes("404") ? 404 : ((e as { status?: number }).status ?? 400);
    await recordMetric("fn-data-export", started, "error");
    return json({ error: safeErrorMessage(e) }, status, req);
  }
});
