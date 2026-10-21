import { guardRoute } from '@/lib/page-guard';
import { SettingsHomeScreen } from '@/components/screens/SettingsHomeScreen';

export default async function Page() {
  await guardRoute('/settings');
  return <SettingsHomeScreen />;
}
