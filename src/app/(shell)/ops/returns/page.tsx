import { guardRoute } from '@/lib/page-guard';
import { ReturnsScreen } from '@/components/screens/ReturnsScreen';

export default async function Page() {
  await guardRoute('/ops/returns');
  return <ReturnsScreen />;
}
