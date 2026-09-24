import { guardRoute } from '@/lib/page-guard';
import { TelegramOrdersScreen } from '@/components/screens/TelegramOrdersScreen';

export default async function Page() {
  await guardRoute('/growth/telegram/orders');
  return <TelegramOrdersScreen />;
}
