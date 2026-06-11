export async function sendGrandchildHello(config: { supabaseUrl: string; accessToken: string }, body: Record<string, unknown>) {
  const response = await fetch(`${config.supabaseUrl}/functions/v1/fn-grandchild-message-send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? 'Could not send grandchild hello');
  return json;
}
