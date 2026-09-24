import { guardRoute } from '@/lib/page-guard';
import { WhatsAppInboxScreen } from '@/components/screens/WhatsAppInboxScreen';

export default async function Page() {
  await guardRoute('/growth/whatsapp/inbox');
  return <WhatsAppInboxScreen />;
}
