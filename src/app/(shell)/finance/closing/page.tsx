import { guardRoute } from '@/lib/page-guard';
import { ClosingScreen } from '@/components/screens/finance/ClosingScreen';

export default async function Page() {
  await guardRoute('/finance/closing');
  return <ClosingScreen />;
}
