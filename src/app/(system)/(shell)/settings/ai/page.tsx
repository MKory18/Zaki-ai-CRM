import { guardRoute } from '@/lib/page-guard';
import { AiSettingsScreen } from '@/components/screens/AiSettingsScreen';

export default async function Page() {
  await guardRoute('/settings/ai');
  return <AiSettingsScreen />;
}
