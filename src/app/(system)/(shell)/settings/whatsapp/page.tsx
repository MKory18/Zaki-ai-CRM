import { guardRoute } from '@/lib/page-guard';
import { WhatsAppSettingsScreen } from '@/components/screens/WhatsAppSettingsScreen';

export default async function Page() {
  await guardRoute('/settings/whatsapp');
  return <WhatsAppSettingsScreen />;
}
