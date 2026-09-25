import { guardRoute } from '@/lib/page-guard';
import { StoreDomainScreen } from '@/components/screens/StoreDomainScreen';

export default async function Page() {
  await guardRoute('/store/domain');
  return <StoreDomainScreen />;
}
