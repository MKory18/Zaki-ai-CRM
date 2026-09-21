import { guardRoute } from '@/lib/page-guard';
import { MatchingScreen } from '@/components/screens/finance/MatchingScreen';

export default async function Page() {
  await guardRoute('/finance/matching');
  return <MatchingScreen />;
}
