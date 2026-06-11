import { DashboardCard } from '../../../components/DashboardCard';
export default function LocationPage() {
  return <main style={{ padding: 32, background: '#F5F3EE', minHeight: '100vh' }}><DashboardCard title="Location" subtitle="Fuzzed privacy model"><p>Only approximate safe-zone events are shown. Precise coordinates are blocked at column level and nulled after 24 hours.</p></DashboardCard></main>;
}
