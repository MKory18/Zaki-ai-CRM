import { guardRoute } from '@/lib/page-guard';
import { StorefrontsScreen } from '@/components/screens/StorefrontsScreen';

export default async function Page() {
  await guardRoute('/store/single-product');
  return <StorefrontsScreen />;
}
