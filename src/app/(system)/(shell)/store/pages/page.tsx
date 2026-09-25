import { guardRoute } from '@/lib/page-guard';
import { StorePagesScreen } from '@/components/screens/StorePagesScreen';

export default async function Page() {
  await guardRoute('/store/pages');
  return <StorePagesScreen />;
}
