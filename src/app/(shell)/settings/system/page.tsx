import { guardRoute } from '@/lib/page-guard';
import { SystemSettingsScreen } from '@/components/screens/SystemSettingsScreen';

export default async function Page() {
  await guardRoute('/settings/system');
  return <SystemSettingsScreen />;
}
