import { guardRoute } from '@/lib/page-guard';
import { InventoryMovementsScreen } from '@/components/screens/InventoryMovementsScreen';

export default async function Page() {
  await guardRoute('/inventory/movements');
  return <InventoryMovementsScreen />;
}
