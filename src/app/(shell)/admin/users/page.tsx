import { guardRoute } from '@/lib/page-guard';
import { UsersScreen } from '@/components/screens/UsersScreen';

export default async function Page() {
  await guardRoute('/admin/users');
  return <UsersScreen />;
}
