import { guardRoute } from '@/lib/page-guard';
import { CampaignsScreen } from '@/components/screens/CampaignsScreen';

export default async function Page() {
  await guardRoute('/growth/campaigns');
  return <CampaignsScreen />;
}
