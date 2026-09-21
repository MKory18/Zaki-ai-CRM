import { guardRoute } from '@/lib/page-guard';
import { DashboardScreen } from '@/components/screens/DashboardScreen';

export default async function Page() {
  await guardRoute('/dashboard');
  return <DashboardScreen />;
}
