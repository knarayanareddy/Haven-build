// ─── Phase 1.5: WhatsApp Business API helper for critical alert fallback ───
// Sends a WhatsApp template message when push notifications fail for P0/P1 alerts.
// Uses Meta WhatsApp Business Cloud API (graph.facebook.com).
// Respects quiet hours (22:00-08:00 Europe/Amsterdam).
//
// Security: Only called from dispatchNotification after all push attempts fail.
// Only for consented family members with whatsapp_enabled=true.
// Never sends BSN or precise location data.

const WHATSAPP_API = 'https://graph.facebook.com/v21.0';

function isQuietHours(): boolean {
  const now = new Date();
  // Europe/Amsterdam is UTC+1 or UTC+2 (DST)
  const amsterdamHour = now.getUTCHours() + (now.getMonth() >= 2 && now.getMonth() <= 9 ? 2 : 1);
  const hour = amsterdamHour % 24;
  return hour >= 22 || hour < 8;
}

export async function sendWhatsAppMessage(
  phoneNumber: string,
  bodyNl: string,
  elderName?: string,
): Promise<{ success: boolean; skipped?: string }> {
  // Respect quiet hours — never buzz family at night
  if (isQuietHours()) {
    return { success: false, skipped: 'quiet_hours' };
  }

  const phoneId = Deno.env.get('WHATSAPP_BUSINESS_PHONE_ID');
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');

  if (!phoneId || !accessToken) {
    console.warn('WhatsApp fallback skipped: WHATSAPP_BUSINESS_PHONE_ID or WHATSAPP_ACCESS_TOKEN not configured');
    return { success: false, skipped: 'not_configured' };
  }

  // Sanitize phone number to E.164-ish format (remove spaces, +, ensure NL prefix)
  const to = phoneNumber.replace(/[\s\-()]/g, '').replace(/^00/, '+').replace(/^0/, '+31');

  // Truncate message to WhatsApp's 4096 char limit, leave room for prefix
  const prefix = elderName ? `HAVEN — ${elderName}: ` : 'HAVEN: ';
  const maxBody = 4000 - prefix.length;
  const body = (prefix + bodyNl).slice(0, 4000);

  try {
    const response = await fetch(`${WHATSAPP_API}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.warn(`WhatsApp send failed: ${response.status} ${errText.slice(0, 240)}`);
      return { success: false, skipped: `http_${response.status}` };
    }

    const json = await response.json();
    if (!json.messages?.[0]?.id) {
      console.warn('WhatsApp send returned unexpected response:', JSON.stringify(json).slice(0, 240));
      return { success: false, skipped: 'no_message_id' };
    }

    return { success: true };
  } catch (error) {
    console.warn(`WhatsApp send error: ${String((error as Error).message ?? error).slice(0, 240)}`);
    return { success: false, skipped: 'network_error' };
  }
}
