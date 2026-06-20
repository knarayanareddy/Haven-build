import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { withIdempotency } from "../_shared/idempotency.ts";

const ALLOWED = new Set(["accepted", "declined", "deferred"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid", pack_key: "string", decision: "string" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), "elder");
    if (!ALLOWED.has(String(body.decision))) throw new Error("decision must be accepted, declined or deferred");

    const idem = req.headers.get("idempotency-key") ?? body.idempotency_key ?? `${body.elder_id}:${body.pack_key}:${body.decision}`;
    const result = await withIdempotency({
      key: idem,
      functionName: "fn-consent-pack-decide",
      elderId: body.elder_id,
      profileId: userId,
      requestBody: body,
      run: async () => {
        const db = userClient(req);
        // Upsert: if the elder has already decided, this updates; otherwise inserts.
        const decidedAt = body.decision === "deferred" ? null : new Date().toISOString();
        const { data, error } = await db.from("consent_pack_status").upsert({
          elder_id: body.elder_id,
          pack_key: body.pack_key,
          status: body.decision,
          decided_at: decidedAt,
        }, { onConflict: "elder_id,pack_key" }).select().single();
        if (error) throw error;

        // Side effect: if a pack is declined, we also write a consent_records "declined" entry for audit.
        if (body.decision === "declined") {
          await db.from("consent_records").insert({
            elder_id: body.elder_id,
            consent_type: `pack:${body.pack_key}`,
            granted: false,
            consent_version: "1.2.1",
            channel: "elder_app",
            granted_at: new Date().toISOString(),
            withdrawn_at: new Date().toISOString(),
          }).catch(() => undefined);
        }

        // Compute what to show next: the next not_shown or deferred pack.
        const { data: allPacks } = await db.from("consent_packs").select("pack_key, title_nl, title_en, description_nl, description_en, recommended_day").order("recommended_day", { ascending: true });
        const { data: statuses } = await db.from("consent_pack_status").select("pack_key, status").eq("elder_id", body.elder_id);
        const taken: Record<string, string> = {};
        for (const s of statuses ?? []) taken[s.pack_key] = s.status;
        const next = (allPacks ?? []).find((p) => !taken[p.pack_key] || taken[p.pack_key] === "not_shown" || taken[p.pack_key] === "deferred");

        return { body: { elder_id: body.elder_id, pack_key: body.pack_key, decision: body.decision, decided_at: data.decided_at, next_pack: next ?? null } };
      },
    });

    await recordMetric("fn-consent-pack-decide", started, "success");
    return json(result.body, result.status ?? 200, req);
  } catch (e) {
    await recordMetric("fn-consent-pack-decide", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});