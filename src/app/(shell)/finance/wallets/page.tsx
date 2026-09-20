import { guardRoute } from '@/lib/page-guard';
import { WalletsScreen } from '@/components/screens/finance/WalletsScreen';

export default async function Page() {
  await guardRoute('/finance/wallets');
  return <WalletsScreen />;
}
