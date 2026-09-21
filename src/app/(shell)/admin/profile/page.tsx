import { guardRoute } from '@/lib/page-guard';
import { ProfileScreen } from '@/components/screens/ProfileScreen';

export default async function Page() {
  await guardRoute('/admin/profile');
  return <ProfileScreen />;
}
