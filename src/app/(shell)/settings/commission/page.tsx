import { guardRoute } from '@/lib/page-guard';
import { CommissionSettingsScreen } from '@/components/screens/CommissionSettingsScreen';

export default async function Page() {
  await guardRoute('/settings/commission');
  return <CommissionSettingsScreen />;
}
