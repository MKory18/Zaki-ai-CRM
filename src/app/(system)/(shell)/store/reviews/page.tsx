import { guardRoute } from '@/lib/page-guard';
import { StoreReviewsScreen } from '@/components/screens/StoreReviewsScreen';

export default async function Page() {
  await guardRoute('/store/reviews');
  return <StoreReviewsScreen />;
}
