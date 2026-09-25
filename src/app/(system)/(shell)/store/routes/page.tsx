import { guardRoute } from '@/lib/page-guard';
import { StoreRoutesScreen } from '@/components/screens/StoreRoutesScreen';

export default async function Page() {
  await guardRoute('/store/routes');
  return <StoreRoutesScreen />;
}
