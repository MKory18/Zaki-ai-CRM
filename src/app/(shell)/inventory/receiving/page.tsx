import { guardRoute } from '@/lib/page-guard';
import { InventoryReceivingScreen } from '@/components/screens/InventoryReceivingScreen';

export default async function Page() {
  await guardRoute('/inventory/receiving');
  return <InventoryReceivingScreen />;
}
