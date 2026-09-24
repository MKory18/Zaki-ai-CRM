import { guardRoute } from '@/lib/page-guard';
import { TrackingScreen } from '@/components/screens/TrackingScreen';

export default async function Page() {
  await guardRoute('/ops/tracking');
  return <TrackingScreen />;
}
