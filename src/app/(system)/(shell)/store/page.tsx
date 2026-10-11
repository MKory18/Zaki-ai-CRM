import { guardRoute } from '@/lib/page-guard';
import { StoresScreen } from '@/components/screens/StoresScreen';

export default async function Page() {
  await guardRoute('/store');
  return <StoresScreen />;
}
