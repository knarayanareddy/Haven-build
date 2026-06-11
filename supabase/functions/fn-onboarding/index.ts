import { admin, cors, dispatchNotification, json, recordMetric, requireFields } from "../_shared/core.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  try {
    const body = await req.json();
    requireFields(body, ["family_member_id", "elder_name", "elder_locale"]);
    const db = admin();
    let elderId = body.elder_id;
    if (!elderId) {
      const { data: created, error: userError } = await db.auth.admin.createUser({ email: body.elder_email, phone: body.elder_phone, email_confirm: Boolean(body.elder_email), phone_confirm: Boolean(body.elder_phone), user_metadata: { invited_by: body.family_member_id } });
      if (userError) throw userError;
      elderId = created.user?.id;
    }
    if (!elderId) throw new Error("Could not create elder auth user");
    await db.from("profiles").upsert({ id: elderId, role: "elder", full_name: body.elder_name, preferred_name: body.elder_preferred_name ?? body.elder_name.split(" ")[0], phone_nl: body.elder_phone, locale: body.elder_locale, timezone: "Europe/Amsterdam", onboarding_complete: false });
    await db.from("elder_profiles").upsert({ elder_id: elderId, safe_zone_label_nl: body.safe_zone_label_nl ?? "Thuis", safe_zone_radius_m: body.safe_zone_radius_m ?? 500 });
    const { data: relationship, error: relError } = await db.from("family_relationships").upsert({ elder_id: elderId, family_member_id: body.family_member_id, relation_label_nl: body.relation_label_nl ?? "familie", is_primary: true, elder_consented: false, is_active: false }, { onConflict: "elder_id,family_member_id" }).select().single();
    if (relError) throw relError;
    await dispatchNotification({ recipient_id: body.family_member_id, elder_id: elderId, notification_type: "systeem", title_nl: "Elder uitnodiging klaar", title_en: "Elder invite ready", body_nl: "De HAVEN-uitnodiging is aangemaakt. Activeer samen met de oudere.", body_en: "The HAVEN invite is ready. Activate it together with the elder.", data: { elder_id: elderId, relationship_id: relationship.id } });
    await recordMetric("fn-onboarding", started, "success");
    return json({ success: true, elder_id: elderId, relationship_id: relationship.id, activation_required: true });
  } catch (e) {
    await recordMetric("fn-onboarding", started, "error");
    return json({ error: String(e.message ?? e) }, 400);
  }
});
