import { guardRoute } from '@/lib/page-guard';
import { ProductDetailScreen } from '@/components/screens/ProductDetailScreen';

export default async function Page() {
  await guardRoute('/products');
  return <ProductDetailScreen />;
}
