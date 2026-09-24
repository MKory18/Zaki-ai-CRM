import { guardRoute } from '@/lib/page-guard';
import { ConfirmationQueueScreen } from '@/components/screens/ConfirmationQueueScreen';

export default async function Page() {
  await guardRoute('/confirmation/queue');
  return <ConfirmationQueueScreen />;
}
