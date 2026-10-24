import { guardRoute } from '@/lib/page-guard';
import { LinksSettingsScreen } from '@/components/screens/LinksSettingsScreen';

export default async function Page() {
  await guardRoute('/settings/links');
  return <LinksSettingsScreen />;
}
