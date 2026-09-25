import { guardRoute } from '@/lib/page-guard';
import { StoreLanguagesScreen } from '@/components/screens/StoreLanguagesScreen';

export default async function Page() {
  await guardRoute('/store/languages');
  return <StoreLanguagesScreen />;
}
