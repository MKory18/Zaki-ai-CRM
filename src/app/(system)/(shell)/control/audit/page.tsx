import { guardRoute } from '@/lib/page-guard';
import { AuditScreen } from '@/components/screens/AuditScreen';

export default async function Page() {
  await guardRoute('/control/audit');
  return <AuditScreen />;
}
