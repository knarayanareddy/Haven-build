import { admin, corsHeaders, dispatchNotification, json, recordMetric, safeErrorMessage } from "../_shared/core.ts";
import { requireInternalAccess } from "../_shared/internal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    requireInternalAccess(req);
    const db = admin();
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const elderSince = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: elders } = await db.from("profiles")
      .select("id, preferred_name, full_name")
      .eq("role", "elder").is("deleted_at", null);

    const flagged: string[] = [];
    for (const elder of elders ?? []) {
      // Today's metrics
      const { count: todayVoice } = await db.from("voice_interactions")
        .select("*", { count: "exact", head: true })
        .eq("elder_id", elder.id)
        .gte("created_at", todayStart.toISOString())
        .is("deleted_at", null);
      const { count: todayCheckins } = await db.from("wellness_checkins")
        .select("*", { count: "exact", head: true })
        .eq("elder_id", elder.id)
        .gte("checked_in_at", todayStart.toISOString());
      const { data: latestSession } = await db.from("device_sessions")
        .select("last_seen_at").eq("profile_id", elder.id).is("revoked_at", null)
        .order("last_seen_at", { ascending: false }).limit(1).maybeSingle();

      // Baseline
      const { data: baseline } = await db.from("elder_baselines")
        .select("avg_daily_voice_interactions, avg_daily_checkins")
        .eq("elder_id", elder.id).maybeSingle();

      const baselineVoice = Number(baseline?.avg_daily_voice_interactions ?? 0);
      const baselineCheckins = Number(baseline?.avg_daily_checkins ?? 0);

      // Quiet day heuristic:
      //  - voice interactions < 40% of baseline OR = 0 by 18:00
      //  - AND no wellness check-ins after 10:00
      //  - AND last heartbeat > 6h
      const voiceRatio = baselineVoice > 0 ? Number(todayVoice ?? 0) / baselineVoice : 1;
      const quietByVoice = baselineVoice > 0 && voiceRatio < 0.4;
      const quietByCheckins = Number(todayCheckins ?? 0) === 0 && now - todayStart.getTime() > 10 * 60 * 60 * 1000;
      const staleHeartbeat = latestSession && now - new Date(latestSession.last_seen_at).getTime() > 6 * 60 * 60 * 1000;

      if ((quietByVoice || quietByCheckins) && (staleHeartbeat || baselineVoice === 0)) {
        const { data: family } = await db.from("family_relationships")
          .select("family_member_id").eq("elder_id", elder.id).eq("elder_consented", true).eq("is_active", true).eq("can_view_alerts", true);
        for (const f of family ?? []) {
          await dispatchNotification({
            recipient_id: f.family_member_id,
            elder_id: elder.id,
            notification_type: "welzijnscheck",
            title_nl: "Vandaag stiller dan normaal",
            title_en: "Today is quieter than usual",
            body_nl: "Er zijn vandaag minder stemacties dan gebruikelijk. Een rustig belletje kan helpen.",
            body_en: "There were fewer voice interactions today than usual. A calm phone call might help.",
            data: { today_voice: Number(todayVoice ?? 0), baseline_voice: baselineVoice, today_checkins: Number(todayCheckins ?? 0), baseline_checkins: baselineCheckins },
          });
        }
        flagged.push(elder.id);
      }
    }

    await recordMetric("fn-quiet-day-detector", started, "success");
    return json({ ok: true, elders_flagged: flagged.length });
  } catch (e) {
    await recordMetric("fn-quiet-day-detector", started, "error");
    return json({ error: safeErrorMessage(e) }, 400, req);
  }
});
