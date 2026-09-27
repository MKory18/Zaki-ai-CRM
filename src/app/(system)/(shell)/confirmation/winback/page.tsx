import { guardRoute } from '@/lib/page-guard';
import { WinbackScreen } from '@/components/screens/WinbackScreen';

export default async function Page() {
  await guardRoute('/confirmation/winback');
  return <WinbackScreen />;
}
