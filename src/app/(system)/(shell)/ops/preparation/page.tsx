import { guardRoute } from '@/lib/page-guard';
import { PreparationScreen } from '@/components/screens/PreparationScreen';

export default async function Page() {
  await guardRoute('/ops/preparation');
  return <PreparationScreen />;
}
