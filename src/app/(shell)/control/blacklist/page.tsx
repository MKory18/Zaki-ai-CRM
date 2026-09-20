import { guardRoute } from '@/lib/page-guard';
import { BlacklistScreen } from '@/components/screens/BlacklistScreen';

export default async function Page() {
  await guardRoute('/control/blacklist');
  return <BlacklistScreen />;
}
