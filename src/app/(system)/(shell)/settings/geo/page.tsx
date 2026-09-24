import { guardRoute } from '@/lib/page-guard';
import { GeoSettingsScreen } from '@/components/screens/GeoSettingsScreen';

export default async function Page() {
  await guardRoute('/settings/geo');
  return <GeoSettingsScreen />;
}
