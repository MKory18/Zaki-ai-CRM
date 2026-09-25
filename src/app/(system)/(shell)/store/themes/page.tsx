import { guardRoute } from '@/lib/page-guard';
import { StoreThemeScreen } from '@/components/screens/StoreThemeScreen';

export default async function Page() {
  await guardRoute('/store/themes');
  return <StoreThemeScreen />;
}
