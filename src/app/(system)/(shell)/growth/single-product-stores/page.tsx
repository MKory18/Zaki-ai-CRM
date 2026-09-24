import { guardRoute } from '@/lib/page-guard';
import { StorefrontsScreen } from '@/components/screens/StorefrontsScreen';

export default async function Page() {
  await guardRoute('/growth/single-product-stores');
  return <StorefrontsScreen />;
}
