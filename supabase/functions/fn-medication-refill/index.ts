import { admin, corsHeaders, dispatchNotification, json, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";

// ─── Phase 2.3: Pharmacy refill email ───
// When stock <= threshold, notify family AND send email to pharmacy if configured.
// Uses Supabase's built-in go_true/admin email or a configured SMTP relay.

async function sendPharmacyRefillEmail(
  pharmacyEmail: string,
  pharmacyName: string,
  medicationName: string,
  elderName: string,
): Promise<boolean> {
  // Use a simple fetch-based email relay (Resend, SendGrid, or Supabase SMTP)
  const emailApiKey = Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("SENDGRID_API_KEY");
  if (!emailApiKey) {
    console.warn("Pharmacy refill email skipped: no email API key configured (set RESEND_API_KEY or SENDGRID_API_KEY)");
    return false;
  }

  const fromEmail = Deno.env.get("HAVEN_FROM_EMAIL") ?? "noreply@haven.nl";

  try {
    // Try Resend API first
    if (Deno.env.get("RESEND_API_KEY")) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${emailApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `HAVEN Zorg <${fromEmail}>`,
          to: pharmacyEmail,
          subject: `Refill verzoek: ${medicationName} voor ${elderName}`,
          text: [
            `Beste ${pharmacyName},`,
            "",
            `HAVEN signaleert dat ${medicationName} voor ${elderName} bijna op is.`,
            `Graag een nieuwe voorraad klaarzetten.`,
            "",
            "Dit is een automatisch bericht van HAVEN. Antwoord niet op deze e-mail.",
            "Voor vragen kunt u contact opnemen met de mantelzorger via de HAVEN Family Dashboard.",
          ].join("\n"),
        }),
      });
      return response.ok;
    }

    // Try SendGrid API
    if (Deno.env.get("SENDGRID_API_KEY")) {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${emailApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: pharmacyEmail }] }],
          from: { email: fromEmail, name: "HAVEN Zorg" },
          subject: `Refill verzoek: ${medicationName} voor ${elderName}`,
          content: [{
            type: "text/plain",
            value: [
              `Beste ${pharmacyName},`,
              "",
              `HAVEN signaleert dat ${medicationName} voor ${elderName} bijna op is.`,
              `Graag een nieuwe voorraad klaarzetten.`,
              "",
              "Dit is een automatisch bericht van HAVEN.",
            ].join("\n"),
          }],
        }),
      });
      return response.ok;
    }

    return false;
  } catch (error) {
    console.warn(`Pharmacy refill email failed: ${String((error as Error).message ?? error).slice(0, 200)}`);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);
    const body = await req.json().catch(() => ({}));
    const db = admin();
    let query = db.from("medications")
      .select("id,elder_id,current_stock,refill_threshold,refill_pharmacy_nl,name_nl,pharmacy_email,pharmacy_name")
      .eq("is_active", true)
      .is("deleted_at", null)
      .not("current_stock", "is", null)
      .not("refill_threshold", "is", null);
    if (body.elder_id) query = query.eq("elder_id", body.elder_id);
    const { data: meds, error } = await query;
    if (error) throw error;

    let created = 0;
    let pharmacyEmailsSent = 0;
    for (const med of meds ?? []) {
      if (Number(med.current_stock) <= Number(med.refill_threshold)) {
        const { data: event } = await db.from("medication_refill_events").insert({
          elder_id: med.elder_id,
          medication_id: med.id,
          current_stock: med.current_stock,
          threshold: med.refill_threshold,
          pharmacy_nl: med.refill_pharmacy_nl,
          status: "due_soon",
        }).select().single();

        // ─── Phase 2.3: Notify family ───
        const { data: family } = await db.from("family_relationships")
          .select("family_member_id")
          .eq("elder_id", med.elder_id)
          .eq("elder_consented", true)
          .eq("is_active", true)
          .eq("can_view_medications", true);
        await Promise.all((family ?? []).map((f) =>
          dispatchNotification({
            recipient_id: f.family_member_id,
            elder_id: med.elder_id,
            notification_type: "systeem",
            title_nl: "Bijna nieuwe voorraad nodig",
            title_en: "Refill may be needed",
            body_nl: `${med.name_nl} raakt bijna op.${med.pharmacy_email ? " Apotheek is geïnformeerd." : ""}`,
            body_en: `${med.name_nl} may need a refill soon.${med.pharmacy_email ? " Pharmacy notified." : ""}`,
            data: { refill_event_id: event?.id ?? "" },
          })
        ));

        // ─── Phase 2.3: Send pharmacy email if configured ───
        if (med.pharmacy_email && med.pharmacy_name) {
          // Fetch elder name for the email
          const { data: profile } = await db.from("profiles")
            .select("preferred_name, full_name")
            .eq("id", med.elder_id)
            .maybeSingle();
          const elderName = profile?.preferred_name ?? profile?.full_name ?? med.elder_id;

          const sent = await sendPharmacyRefillEmail(
            med.pharmacy_email,
            med.pharmacy_name,
            med.name_nl,
            elderName,
          );
          if (sent) {
            pharmacyEmailsSent++;
            await db.from("medication_refill_events")
              .update({ pharmacy_emailed: true, pharmacy_emailed_at: new Date().toISOString() })
              .eq("id", event?.id ?? "");
          }
        }

        created++;
      }
    }

    await recordMetric("fn-medication-refill", started, "success");
    return json({
      success: true,
      refill_events_created: created,
      pharmacy_emails_sent: pharmacyEmailsSent,
    }, 200, req);
  } catch (e) {
    await recordMetric("fn-medication-refill", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
