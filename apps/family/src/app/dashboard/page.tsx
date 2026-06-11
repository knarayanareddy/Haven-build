import { DashboardCard } from '../../components/DashboardCard';

export default function DashboardPage() {
  return (
    <main style={{ display: 'grid', gap: 24, padding: 32, background: '#F5F3EE', minHeight: '100vh' }}>
      <h1>HAVEN dashboard</h1>
      <DashboardCard title="Today" subtitle="Consent-scoped peace-of-mind summary">
        <ul>
          <li>Medication adherence: 94%</li>
          <li>Safety status: calm amber review</li>
          <li>Location: fuzzed safe-zone event view only</li>
          <li>Family contact: message sent today</li>
        </ul>
      </DashboardCard>
    </main>
  );
}
