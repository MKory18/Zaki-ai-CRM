import { guardRoute } from '@/lib/page-guard';
import { ChangeRequestsScreen } from '@/components/screens/ChangeRequestsScreen';

export default async function Page() {
  await guardRoute('/control/change-requests');
  return <ChangeRequestsScreen />;
}
