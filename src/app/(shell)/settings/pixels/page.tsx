import { guardRoute } from '@/lib/page-guard';
import { TrackingPixelsSection } from '@/components/settings/TrackingPixelsSection';

export default async function Page() {
  await guardRoute('/settings/pixels');
  return <TrackingPixelsSection />;
}
