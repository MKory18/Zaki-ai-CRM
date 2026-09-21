import { guardRoute } from '@/lib/page-guard';
import { ConfirmationIssuesScreen } from '@/components/screens/ConfirmationIssuesScreen';

export default async function Page() {
  await guardRoute('/confirmation/issues');
  return <ConfirmationIssuesScreen />;
}
