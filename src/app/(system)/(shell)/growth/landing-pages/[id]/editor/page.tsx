import { guardRoute } from '@/lib/page-guard';
import { LandingPageEditorScreen } from '@/components/screens/LandingPageEditorScreen';

export default async function Page() {
  await guardRoute('/growth/landing-pages');
  return <LandingPageEditorScreen />;
}
