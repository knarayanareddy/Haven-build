import { admin, corsHeaders, dispatchNotification, json, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";

type Status = "green" | "amber" | "red";

function computeStatus(opts: {
  pendingFalls: number;
  noResponseFalls: number;
  highScoreScams: number;
  missedMeds: number;
  totalMeds: number;
  deviceStaleH: number;
}): { status: Status; reasons: string[] } {
  const reasons: string[] = [];
  let status: Status = "green";
  if (opts.noResponseFalls > 0) { status = "red"; reasons.push("Possible fall without response."); }
  else if (opts.pendingFalls > 0) { if (status === "green") status = "amber"; reasons.push("Possible fall awaiting confirmation."); }
  if (opts.highScoreScams > 0) { status = "red"; reasons.push("High-confidence scam detected."); }
  if (opts.totalMeds > 0 && opts.missedMeds / opts.totalMeds > 0.5) { status = "red"; reasons.push("More than half of today's medications missed."); }
  if (status !== "red" && opts.missedMeds > 0) { status = "amber"; reasons.push("Some medications not confirmed today."); }
  if (opts.deviceStaleH > 24) { status = status === "green" ? "amber" : status; reasons.push("Device has not checked in for over 24 hours."); }
  return { status, reasons };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);
    const db = admin();
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const { data: elders } = await db.from("profiles")
      .select("id, preferred_name, full_name")
      .eq("role", "elder").is("deleted_at", null);

    const digests: Array<{ elder_id: string; status: Status; reasons: string[] }> = [];
    for (const elder of elders ?? []) {
      const { count: pendingFalls } = await db.from("fall_events")
        .select("*", { count: "exact", head: true }).eq("elder_id", elder.id).eq("status", "possible");
      const { count: noResponseFalls } = await db.from("fall_events")
        .select("*", { count: "exact", head: true }).eq("elder_id", elder.id).eq("status", "no_response");
      const { count: highScoreScams } = await db.from("scam_events")
        .select("*", { count: "exact", head: true }).eq("elder_id", elder.id).gte("created_at", todayIso)
        .in("alert_level", ["rood", "zwart"]);
      const { count: todayMeds } = await db.from("medication_reminders")
        .select("*", { count: "exact", head: true }).eq("elder_id", elder.id).gte("scheduled_time", todayIso);
      const { count: missedMeds } = await db.from("medication_reminders")
        .select("*", { count: "exact", head: true }).eq("elder_id", elder.id).gte("scheduled_time", todayIso)
        .in("status", ["gemist", "geëscaleerd", "overgeslagen"]);
      const { data: latestSession } = await db.from("device_sessions")
        .select("last_seen_at").eq("profile_id", elder.id).is("revoked_at", null)
        .order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
      const deviceStaleH = latestSession ? (now - new Date(latestSession.last_seen_at).getTime()) / 3600000 : 999;

      const { status, reasons } = computeStatus({
        pendingFalls: Number(pendingFalls ?? 0),
        noResponseFalls: Number(noResponseFalls ?? 0),
        highScoreScams: Number(highScoreScams ?? 0),
        missedMeds: Number(missedMeds ?? 0),
        totalMeds: Number(todayMeds ?? 0),
        deviceStaleH,
      });

      // Quiet hours: skip between 22:00 and 08:00 Europe/Amsterdam
      const hour = new Date().getHours();
      if (hour >= 22 || hour < 8) {
        digests.push({ elder_id: elder.id, status, reasons: ["quiet_hours_skip"] });
        continue;
      }

      const { data: family } = await db.from("family_relationships")
        .select("family_member_id").eq("elder_id", elder.id).eq("elder_consented", true).eq("is_active", true).eq("can_view_alerts", true);
      for (const f of family ?? []) {
        const title = status === "green" ? "Alles goed vandaag" : status === "amber" ? "Even opletten vandaag" : "Actie nodig";
        const body = status === "green"
          ? `${elder.preferred_name ?? elder.full_name} heeft vandaag geen bijzonderheden laten zien.`
          : `${elder.preferred_name ?? elder.full_name}: ${reasons.join(" ")}`;
        await dispatchNotification({
          recipient_id: f.family_member_id,
          elder_id: elder.id,
          notification_type: "wekelijks_overzicht",
          title_nl: title,
          title_en: status === "green" ? "All good today" : status === "amber" ? "A little quiet today" : "Action needed",
          body_nl: body,
          body_en: body,
          data: { status, reasons, generated_at: new Date().toISOString() },
        });
      }
      digests.push({ elder_id: elder.id, status, reasons });
    }

    await recordMetric("fn-daily-status-digest", started, "success");
    return json({ ok: true, digests_generated: digests.length });
  } catch (e) {
    await recordMetric("fn-daily-status-digest", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
