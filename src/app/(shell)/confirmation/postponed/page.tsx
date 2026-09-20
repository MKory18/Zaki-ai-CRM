import { guardRoute } from '@/lib/page-guard';
import { ConfirmationPostponedScreen } from '@/components/screens/ConfirmationPostponedScreen';

export default async function Page() {
  await guardRoute('/confirmation/postponed');
  return <ConfirmationPostponedScreen />;
}
