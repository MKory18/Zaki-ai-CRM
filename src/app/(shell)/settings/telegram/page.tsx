import { guardRoute } from '@/lib/page-guard';
import { TelegramSettingsScreen } from '@/components/screens/TelegramSettingsScreen';

export default async function Page() {
  await guardRoute('/settings/telegram');
  return <TelegramSettingsScreen />;
}
