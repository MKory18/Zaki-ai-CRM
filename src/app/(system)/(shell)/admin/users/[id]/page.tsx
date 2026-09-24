import { guardRoute } from '@/lib/page-guard';
import { UserDetailScreen } from '@/components/screens/UserDetailScreen';

export default async function Page() {
  await guardRoute('/admin/users');
  return <UserDetailScreen />;
}
