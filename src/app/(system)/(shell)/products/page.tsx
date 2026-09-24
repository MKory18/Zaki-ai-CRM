import { guardRoute } from '@/lib/page-guard';
import { ProductsScreen } from '@/components/screens/ProductsScreen';

export default async function Page() {
  await guardRoute('/products');
  return <ProductsScreen />;
}
