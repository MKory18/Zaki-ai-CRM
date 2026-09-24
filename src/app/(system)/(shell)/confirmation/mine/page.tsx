import { guardRoute } from '@/lib/page-guard';
import { ConfirmationMineScreen } from '@/components/screens/ConfirmationMineScreen';

export default async function Page() {
  await guardRoute('/confirmation/mine');
  return <ConfirmationMineScreen />;
}
