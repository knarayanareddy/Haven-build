export default function Page() {
  return (
    <main style={{ padding: 32, fontFamily: 'Nunito, system-ui', background: '#F5F3EE', minHeight: '100vh' }}>
      <h1 style={{ color: '#1A1F2E' }}>HAVEN Family Dashboard</h1>
      <p>Consent-scoped family dashboard. Use the static preview in apps/family-dashboard for the visual build.</p>
      <section style={{ background: 'white', borderRadius: 24, padding: 24 }}>
        <h2>Production data source</h2>
        <p>Reads from the Supabase RPC <code>family_dashboard_summary</code> and realtime tables.</p>
      </section>
    </main>
  );
}
