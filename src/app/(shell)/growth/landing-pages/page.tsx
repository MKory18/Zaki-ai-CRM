import { guardRoute } from '@/lib/page-guard';
import { LandingPagesScreen } from '@/components/screens/LandingPagesScreen';

export default async function Page() {
  await guardRoute('/growth/landing-pages');
  return <LandingPagesScreen />;
}
