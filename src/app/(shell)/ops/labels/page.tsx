import { guardRoute } from '@/lib/page-guard';
import { LabelsScreen } from '@/components/screens/LabelsScreen';

export default async function Page() {
  await guardRoute('/ops/labels');
  return <LabelsScreen />;
}
