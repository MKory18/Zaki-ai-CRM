import { guardRoute } from '@/lib/page-guard';
import { CouriersScreen } from '@/components/screens/CouriersScreen';

export default async function Page() {
  await guardRoute('/settings/couriers');
  return <CouriersScreen />;
}
