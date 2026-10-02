import { guardRoute } from '@/lib/page-guard';
import { StoreSearchScreen } from '@/components/screens/StoreSearchScreen';

export default async function Page() {
  await guardRoute('/store/search');
  return <StoreSearchScreen />;
}
