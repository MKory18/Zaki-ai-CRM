import { guardRoute } from '@/lib/page-guard';
import { LandingPageEditorScreen } from '@/components/screens/LandingPageEditorScreen';

export default async function Page() {
  await guardRoute('/store/landing-pages');
  return <LandingPageEditorScreen />;
}
