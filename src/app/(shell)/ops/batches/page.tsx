import { guardRoute } from '@/lib/page-guard';
import { ShippingBatchesScreen } from '@/components/screens/ShippingBatchesScreen';

export default async function Page() {
  await guardRoute('/ops/batches');
  return <ShippingBatchesScreen />;
}
