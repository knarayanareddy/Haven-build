import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { elder_id: "uuid" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.elder_id), "elder");

    const db = userClient(req);
    const { data: packs } = await db.from("consent_packs").select("pack_key, title_nl, title_en, description_nl, description_en, recommended_day").order("recommended_day", { ascending: true });
    if (!packs) return json({ body: { elder_id: body.elder_id, packs: [], pending_packs: [] } });

    const { data: statuses } = await db.from("consent_pack_status")
      .select("pack_key, status, decided_at").eq("elder_id", body.elder_id);
    const statusByKey: Record<string, { status: string; decided_at: string | null }> = {};
    for (const s of statuses ?? []) statusByKey[s.pack_key] = { status: s.status, decided_at: s.decided_at };

    // Pending = not shown yet OR shown but deferred.
    const pending = packs
      .filter((p) => !statusByKey[p.pack_key] || statusByKey[p.pack_key].status === "not_shown" || statusByKey[p.pack_key].status === "deferred")
      .map((p) => ({ ...p, current_status: statusByKey[p.pack_key]?.status ?? "not_shown" }));

    // Accepted list (for the elder's records view).
    const accepted = packs
      .filter((p) => statusByKey[p.pack_key]?.status === "accepted")
      .map((p) => ({ pack_key: p.pack_key, decided_at: statusByKey[p.pack_key].decided_at }));

    await recordMetric("fn-consent-pack-list", started, "success");
    return json({ body: { elder_id: body.elder_id, pending_count: pending.length, pending_packs: pending, accepted_packs: accepted } });
  } catch (e) {
    await recordMetric("fn-consent-pack-list", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});