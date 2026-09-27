import { guardRoute } from '@/lib/page-guard';
import { LandingPagesScreen } from '@/components/screens/LandingPagesScreen';

export default async function Page() {
  await guardRoute('/store/landing-pages');
  return <LandingPagesScreen />;
}
