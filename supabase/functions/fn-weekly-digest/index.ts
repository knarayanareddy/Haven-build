import { admin, corsHeaders, dispatchNotification, json, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";

// ─── Phase 2.4: Weekly digest email delivery ───
// Every Sunday 10:00, generates safety digests and sends:
//  - Push notification (existing)
//  - Email to family members with email_digest_enabled=true (new)

async function sendDigestEmail(
  recipientEmail: string,
  elderName: string,
  digest: {
    medications_taken_pct: number | null;
    scam_events_count: number;
    amber_count: number;
    rood_count: number;
    zwart_count: number;
    family_interactions: number;
  },
): Promise<boolean> {
  const emailApiKey = Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("SENDGRID_API_KEY");
  if (!emailApiKey) {
    console.warn("Weekly digest email skipped: no email API key configured");
    return false;
  }

  const fromEmail = Deno.env.get("HAVEN_FROM_EMAIL") ?? "noreply@haven.nl";

  const statusEmoji = digest.rood_count > 0 || digest.zwart_count > 0 ? "🔴" :
                       digest.amber_count > 0 ? "🟠" : "🟢";

  const subject = `${statusEmoji} HAVEN weekoverzicht voor ${elderName}`;
  const body = [
    `HAVEN weekoverzicht voor ${elderName}`,
    "",
    `${statusEmoji} Status: ${digest.rood_count > 0 || digest.zwart_count > 0 ? "Aandacht nodig" : digest.amber_count > 0 ? "Rustig — kleine aandachtspunten" : "Alles goed"}`,
    "",
    `💊 Medicijnen: ${digest.medications_taken_pct !== null ? `${digest.medications_taken_pct}% ingenomen` : "geen gegevens"}`,
    `🛡️ Veiligheid: ${digest.scam_events_count} meldingen (${digest.amber_count} amber, ${digest.rood_count} rood, ${digest.zwart_count} zwart)`,
    `👋 Familiecontact: ${digest.family_interactions} berichten`,
    "",
    "Open de HAVEN Family Dashboard voor meer details.",
    "",
    "Dit is een automatisch bericht van HAVEN. Antwoord niet op deze e-mail.",
  ].join("\n");

  try {
    if (Deno.env.get("RESEND_API_KEY")) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${emailApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `HAVEN <${fromEmail}>`,
          to: recipientEmail,
          subject,
          text: body,
        }),
      });
      return response.ok;
    }

    if (Deno.env.get("SENDGRID_API_KEY")) {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${emailApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: recipientEmail }] }],
          from: { email: fromEmail, name: "HAVEN" },
          subject,
          content: [{ type: "text/plain", value: body }],
        }),
      });
      return response.ok;
    }

    return false;
  } catch (error) {
    console.warn(`Digest email failed: ${String((error as Error).message ?? error).slice(0, 200)}`);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);
    const db = admin();
    const week = new Date();
    week.setDate(week.getDate() - week.getDay() + 1);
    const week_starting = week.toISOString().slice(0, 10);
    const { data: elders } = await db.from("profiles").select("id").eq("role", "elder").is("deleted_at", null);

    let created = 0;
    let emailsSent = 0;
    for (const elder of elders ?? []) {
      const [scams, meds, wellness, messages] = await Promise.all([
        db.from("scam_events").select("alert_level", { count: "exact", head: false }).eq("elder_id", elder.id).gte("created_at", week_starting),
        db.from("medication_reminders").select("status", { count: "exact", head: false }).eq("elder_id", elder.id).gte("scheduled_time", week_starting),
        db.from("wellness_checkins").select("mood_score").eq("elder_id", elder.id).gte("checked_in_at", week_starting),
        db.from("family_messages").select("id", { count: "exact", head: false }).eq("elder_id", elder.id).gte("created_at", week_starting),
      ]);

      const medRows = meds.data ?? [];
      const taken = medRows.filter((m: Record<string, string>) => ["ingenomen", "laat_ingenomen"].includes(m.status)).length;
      const moodRows = wellness.data ?? [];
      const mood = moodRows.length
        ? (moodRows as Array<{ mood_score?: number }>).reduce((s, m) => s + Number(m.mood_score ?? 0), 0) / moodRows.length
        : null;

      const digest = {
        elder_id: elder.id,
        week_starting,
        scam_events_count: scams.count ?? (scams.data?.length ?? 0),
        amber_count: ((scams.data ?? []) as Array<{ alert_level: string }>).filter((s) => s.alert_level === "amber").length,
        rood_count: ((scams.data ?? []) as Array<{ alert_level: string }>).filter((s) => s.alert_level === "rood").length,
        zwart_count: ((scams.data ?? []) as Array<{ alert_level: string }>).filter((s) => s.alert_level === "zwart").length,
        medications_taken_pct: medRows.length ? Math.round((taken / medRows.length) * 10000) / 100 : null,
        wellness_avg_score: mood,
        family_interactions: messages.count ?? (messages.data?.length ?? 0),
        summary_nl: "Rustig weekoverzicht met veiligheid, medicijnen, welzijn en familiecontact.",
        summary_en: "Calm weekly overview with safety, medication, wellbeing and family contact.",
      };

      await db.from("safety_digests").upsert(digest, { onConflict: "elder_id,week_starting" });

      // ─── Fetch elder name for personalized messaging ───
      const { data: profile } = await db.from("profiles")
        .select("preferred_name, full_name")
        .eq("id", elder.id)
        .maybeSingle();
      const elderName = profile?.preferred_name ?? profile?.full_name ?? "uw naaste";

      // ─── Push notification (existing) ───
      const { data: family } = await db.from("family_relationships")
        .select("family_member_id")
        .eq("elder_id", elder.id)
        .eq("elder_consented", true)
        .eq("is_active", true);

      await Promise.all((family ?? []).map((f) =>
        dispatchNotification({
          recipient_id: f.family_member_id,
          elder_id: elder.id,
          notification_type: "wekelijks_overzicht",
          title_nl: "HAVEN weekoverzicht",
          title_en: "HAVEN weekly digest",
          body_nl: `Het rustige weekoverzicht voor ${elderName} staat klaar.`,
          body_en: `The calm weekly digest for ${elderName} is ready.`,
          data: { week_starting },
        })
      ));

      // ─── Phase 2.4: Email delivery for family with email_digest_enabled=true ───
      for (const f of family ?? []) {
        const { data: prefs } = await db
          .from("notification_preferences")
          .select("email_digest_enabled")
          .eq("profile_id", f.family_member_id)
          .maybeSingle();

        if (prefs?.email_digest_enabled) {
          // Fetch the family member's email from auth.users
          const { data: familyProfile } = await db
            .from("profiles")
            .select("id")
            .eq("id", f.family_member_id)
            .maybeSingle();

          if (familyProfile) {
            // Get email via supabase admin API (profiles.id = auth.users.id)
            try {
              const { data: user } = await db.auth.admin.getUserById(f.family_member_id);
              if (user?.user?.email) {
                const sent = await sendDigestEmail(user.user.email, elderName, digest);
                if (sent) emailsSent++;
              }
            } catch (_) {
              // Email is best-effort. Skip silently if user email isn't accessible.
            }
          }
        }
      }

      created++;
    }

    await recordMetric("fn-weekly-digest", started, "success");
    return json({ success: true, digests_created: created, emails_sent: emailsSent }, 200, req);
  } catch (e) {
    await recordMetric("fn-weekly-digest", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
