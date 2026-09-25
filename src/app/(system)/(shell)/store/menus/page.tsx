import { guardRoute } from '@/lib/page-guard';
import { StoreMenusScreen } from '@/components/screens/StoreMenusScreen';

export default async function Page() {
  await guardRoute('/store/menus');
  return <StoreMenusScreen />;
}
