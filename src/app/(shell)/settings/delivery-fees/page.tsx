import { guardRoute } from '@/lib/page-guard';
import { DeliveryFeesScreen } from '@/components/screens/DeliveryFeesScreen';

export default async function Page() {
  await guardRoute('/settings/delivery-fees');
  return <DeliveryFeesScreen />;
}
