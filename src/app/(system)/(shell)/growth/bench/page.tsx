import { guardRoute } from '@/lib/page-guard';
import { BenchScreen } from '@/components/screens/BenchScreen';

export default async function Page() {
  await guardRoute('/growth/bench');
  return <BenchScreen />;
}
