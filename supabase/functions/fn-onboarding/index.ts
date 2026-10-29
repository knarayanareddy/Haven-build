import { admin, corsHeaders, dispatchNotification, json, readJsonBody, recordMetric, requireFields, errorResponse } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";
import { rateLimit } from "../_shared/ratelimit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    // P0-4: rate limit — user creation is sensitive
    await rateLimit(req, "fn-onboarding");
    // P1-2 FIX: requireInternalAccess now uses independent HAVEN_INTERNAL_KEY
    // (no longer falls back to SUPABASE_SERVICE_ROLE_KEY)
    requireInternalAccess(req);
    const body = await readJsonBody(req) as Record<string, unknown>;
    requireFields(body, ["family_member_id", "elder_name", "elder_locale"]);
    const db = admin();
    let elderId = body.elder_id as string | undefined;
    if (!elderId) {
      const { data: created, error: userError } = await db.auth.admin.createUser({
        email: body.elder_email as string,
        phone: body.elder_phone as string,
        email_confirm: Boolean(body.elder_email),
        phone_confirm: Boolean(body.elder_phone),
        user_metadata: { invited_by: body.family_member_id },
      });
      if (userError) throw userError;
      elderId = created.user?.id;
    }
    if (!elderId) throw new Error("Could not create elder auth user");
    await db.from("profiles").upsert({
      id: elderId, role: "elder", full_name: body.elder_name,
      preferred_name: (body.elder_preferred_name as string) ?? (body.elder_name as string).split(" ")[0],
      phone_nl: body.elder_phone, locale: body.elder_locale,
      timezone: "Europe/Amsterdam", onboarding_complete: false,
    });
    await db.from("elder_profiles").upsert({
      elder_id: elderId,
      safe_zone_label_nl: (body.safe_zone_label_nl as string) ?? "Thuis",
      safe_zone_radius_m: (body.safe_zone_radius_m as number) ?? 500,
    });
    const { data: relationship, error: relError } = await db.from("family_relationships").upsert(
      { elder_id: elderId, family_member_id: body.family_member_id, relation_label_nl: (body.relation_label_nl as string) ?? "familie", is_primary: true, elder_consented: false, is_active: false },
      { onConflict: "elder_id,family_member_id" },
    ).select().single();
    if (relError) throw relError;
    await dispatchNotification({
      recipient_id: body.family_member_id as string, elder_id: elderId, notification_type: "systeem",
      title_nl: "Elder uitnodiging klaar", title_en: "Elder invite ready",
      body_nl: "De HAVEN-uitnodiging is aangemaakt. Activeer samen met de oudere.",
      body_en: "The HAVEN invite is ready. Activate it together with the elder.",
      data: { elder_id: elderId, relationship_id: relationship.id },
    });
    await recordMetric("fn-onboarding", started, "success");
    return json({ success: true, elder_id: elderId, relationship_id: relationship.id, activation_required: true }, 200, req);
  } catch (e) {
    await recordMetric("fn-onboarding", started, "error");
    return errorResponse(e, req);
  }
});