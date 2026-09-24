import { guardRoute } from '@/lib/page-guard';
import { PerformanceScreen } from '@/components/screens/PerformanceScreen';

export default async function Page() {
  await guardRoute('/growth/performance');
  return <PerformanceScreen />;
}
