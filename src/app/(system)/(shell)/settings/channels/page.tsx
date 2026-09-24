import { guardRoute } from '@/lib/page-guard';
import { ChannelsScreen } from '@/components/screens/ChannelsScreen';

export default async function Page() {
  await guardRoute('/settings/channels');
  return <ChannelsScreen />;
}
