import { guardRoute } from '@/lib/page-guard';
import { PromotionsScreen } from '@/components/screens/PromotionsScreen';

export default async function Page() {
  await guardRoute('/promotions');
  return <PromotionsScreen />;
}
