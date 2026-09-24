import { guardRoute } from '@/lib/page-guard';
import { FinanceProfitScreen } from '@/components/screens/FinanceProfitScreen';

export default async function Page() {
  await guardRoute('/finance/profit');
  return <FinanceProfitScreen />;
}
