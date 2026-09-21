import { guardRoute } from '@/lib/page-guard';
import { AppStoreScreen } from '@/components/screens/AppStoreScreen';

export default async function Page() {
  await guardRoute('/apps/store');
  return <AppStoreScreen />;
}
