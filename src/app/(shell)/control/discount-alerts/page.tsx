import { guardRoute } from '@/lib/page-guard';
import { DiscountAlertsScreen } from '@/components/screens/DiscountAlertsScreen';

export default async function Page() {
  await guardRoute('/control/discount-alerts');
  return <DiscountAlertsScreen />;
}
