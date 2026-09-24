import { guardRoute } from '@/lib/page-guard';
import { InstalledAppsScreen } from '@/components/screens/InstalledAppsScreen';

export default async function Page() {
  await guardRoute('/apps/installed');
  return <InstalledAppsScreen />;
}
