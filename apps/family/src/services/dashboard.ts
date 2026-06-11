export interface DashboardClientConfig {
  supabaseUrl: string;
  accessToken: string;
}

export async function familyDashboardSummary(config: DashboardClientConfig, elderId: string) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/family_dashboard_summary`, {
    method: 'POST',
    headers: {
      apikey: config.accessToken,
      authorization: `Bearer ${config.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_elder_id: elderId }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message ?? 'Dashboard summary failed');
  return json;
}
