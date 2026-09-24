import { guardRoute } from '@/lib/page-guard';
import { InventoryBalancesScreen } from '@/components/screens/InventoryBalancesScreen';

export default async function Page() {
  await guardRoute('/inventory/balances');
  return <InventoryBalancesScreen />;
}
