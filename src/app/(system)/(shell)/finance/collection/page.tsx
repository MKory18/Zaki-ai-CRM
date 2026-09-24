import { guardRoute } from '@/lib/page-guard';
import { CollectionScreen } from '@/components/screens/finance/CollectionScreen';

export default async function Page() {
  await guardRoute('/finance/collection');
  return <CollectionScreen />;
}
