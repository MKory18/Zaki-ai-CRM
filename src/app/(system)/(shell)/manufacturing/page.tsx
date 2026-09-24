import { guardRoute } from '@/lib/page-guard';
import { ManufacturingScreen } from '@/components/screens/ManufacturingScreen';

export default async function Page() {
  await guardRoute('/manufacturing');
  return <ManufacturingScreen />;
}
