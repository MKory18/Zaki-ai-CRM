import { guardRoute } from '@/lib/page-guard';
import { PermissionsScreen } from '@/components/screens/PermissionsScreen';

export default async function Page() {
  await guardRoute('/admin/permissions');
  return <PermissionsScreen />;
}
