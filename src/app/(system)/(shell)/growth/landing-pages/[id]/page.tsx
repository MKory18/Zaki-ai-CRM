import { guardRoute } from '@/lib/page-guard';
import { LandingPageDetailScreen } from '@/components/screens/LandingPageDetailScreen';

export default async function Page() {
  await guardRoute('/growth/landing-pages');
  return <LandingPageDetailScreen />;
}
