import { guardRoute } from '@/lib/page-guard';
import { TransfersScreen } from '@/components/screens/finance/TransfersScreen';

export default async function Page() {
  await guardRoute('/finance/transfers');
  return <TransfersScreen />;
}
