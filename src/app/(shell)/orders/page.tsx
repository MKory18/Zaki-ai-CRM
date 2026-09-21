import { guardRoute } from '@/lib/page-guard';
import { OrdersScreen } from '@/components/screens/OrdersScreen';

export default async function Page() {
  await guardRoute('/orders');
  return <OrdersScreen />;
}
