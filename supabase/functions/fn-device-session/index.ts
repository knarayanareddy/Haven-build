import { admin, corsHeaders, json, readJsonBody, recordMetric, safeErrorMessage, sha256, userClient } from "../_shared/core.ts";
import { assertSelf, getJwtUserId } from "../_shared/authz.ts";
import { validateBody } from "../_shared/validation.ts";
import { captureException } from "../_shared/sentry.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const started = Date.now();
  try {
    const body = await readJsonBody(req) as Record<string, unknown>;
    validateBody(body, { profile_id: "uuid", platform: "string", device_id: "string" }, { allowUnknown: true });
    const userId = await getJwtUserId(req);
    assertSelf(userId, String(body.profile_id), "device session");
    const deviceIdHash = await sha256(String(body.device_id));
    const batteryPct = (body.battery_pct === null || body.battery_pct === undefined) ? null : Math.max(0, Math.min(100, Number(body.battery_pct)));
    
    // Enrollment / minimal secret provisioning anchor
    const rawEnrollSecret = body.enroll_secret ? crypto.randomUUID() + crypto.randomUUID() : undefined;

    const { data, error } = await userClient(req)
      .from("device_sessions")
      .upsert({
        profile_id: userId,
        platform: String(body.platform),
        device_label: body.device_label ? String(body.device_label) : null,
        device_id_hash: deviceIdHash,
        last_seen_at: new Date().toISOString(),
        revoked_at: body.revoked ? new Date().toISOString() : null,
        app_version: body.app_version ? String(body.app_version) : null,
        os_version: body.os_version ? String(body.os_version) : null,
        locale: body.locale ? String(body.locale) : null,
        timezone: body.timezone ? String(body.timezone) : null,
        battery_pct: batteryPct,
        is_low_power_mode: Boolean(body.is_low_power_mode),
        network_type: body.network_type ? String(body.network_type) : null,
        last_push_token_ok_at: body.push_token_ok ? new Date().toISOString() : null,
        last_location_permission: body.location_permission ? String(body.location_permission) : null,
        last_microphone_permission: body.microphone_permission ? String(body.microphone_permission) : null,
        last_background_refresh_ok: (body.background_refresh_ok === null || body.background_refresh_ok === undefined) ? null : Boolean(body.background_refresh_ok),
        last_error: body.last_error ? String(body.last_error) : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id,device_id_hash" })
      .select()
      .single();

    if (error) throw error;

    const dbAdmin = admin();

    // Verify or bind minimal per-device secret
    const { data: sessionSecret } = await dbAdmin
      .from("device_sessions")
      .select("device_secret")
      .eq("id", data.id)
      .single();

    let finalSecret = sessionSecret?.device_secret;
    if (!finalSecret && rawEnrollSecret) {
      await dbAdmin.from("device_sessions").update({ device_secret: rawEnrollSecret }).eq("id", data.id);
      finalSecret = rawEnrollSecret;
    }

    if (batteryPct !== null && batteryPct < 15) {
      await dbAdmin.from("device_health_events").insert({
        profile_id: userId,
        device_session_id: data.id,
        severity: "warn",
        event_key: "battery_low",
        message_nl: "Batterij onder 15%. Vraag of de oudere wil opladen.",
        message_en: "Battery below 15%. Consider asking them to charge.",
        details: { battery_pct: batteryPct },
      });
    }
    if (body.location_permission === "denied" || body.location_permission === "unavailable") {
      await dbAdmin.from("device_health_events").insert({
        profile_id: userId,
        device_session_id: data.id,
        severity: "warn",
        event_key: "location_denied",
        message_nl: "Locatierecht is uitgeschakeld. Veilige-zone werkt mogelijk niet.",
        message_en: "Location permission is off. Safe-zone may not work.",
        details: { location_permission: body.location_permission },
      });
    }
    if (body.microphone_permission === "denied" || body.microphone_permission === "unavailable") {
      await dbAdmin.from("device_health_events").insert({
        profile_id: userId,
        device_session_id: data.id,
        severity: "warn",
        event_key: "microphone_denied",
        message_nl: "Microfoonrecht is uitgeschakeld. Spraakherkenning werkt niet.",
        message_en: "Microphone permission is off. Voice features will not work.",
        details: { microphone_permission: body.microphone_permission },
      });
    }
    if (body.push_token_ok === false) {
      await dbAdmin.from("device_health_events").insert({
        profile_id: userId,
        device_session_id: data.id,
        severity: "p1",
        event_key: "push_token_invalid",
        message_nl: "Push-token is ongeldig. Meldingen komen mogelijk niet aan.",
        message_en: "Push token is invalid. Notifications may not arrive.",
        details: {},
      });
    }

    let status: "ok" | "degraded" | "offline_risk" = "ok";
    if (batteryPct !== null && batteryPct < 15) status = "degraded";
    if (body.location_permission === "denied" || body.microphone_permission === "denied") status = "degraded";
    if (body.network_type === "none") status = "offline_risk";
    if (body.push_token_ok === false) status = "degraded";

    await recordMetric("fn-device-session", started, "success");
    return json({ 
      success: true, 
      device_session_id: data.id, 
      device_health_status: status,
      device_secret: rawEnrollSecret ? finalSecret : undefined 
    }, 200, req);
  } catch (error) {
    await captureException(error, { fn: "fn-device-session" });
    await recordMetric("fn-device-session", started, "error");
    return json({ error: safeErrorMessage(error) }, 400, req);
  }
});
