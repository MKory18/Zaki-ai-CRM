import { guardRoute } from '@/lib/page-guard';
import { IntelligenceScreen } from '@/components/screens/IntelligenceScreen';

export default async function Page() {
  await guardRoute('/growth/intelligence');
  return <IntelligenceScreen />;
}
