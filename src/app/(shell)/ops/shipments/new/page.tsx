import { guardRoute } from '@/lib/page-guard';
import { ShipmentsNewScreen } from '@/components/screens/ShipmentsNewScreen';

export default async function Page() {
  await guardRoute('/ops/shipments/new');
  return <ShipmentsNewScreen />;
}
