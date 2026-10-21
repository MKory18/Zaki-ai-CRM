import { guardRoute } from '@/lib/page-guard';
import { PenaltiesScreen } from '@/components/screens/PenaltiesScreen';

export const metadata = { title: 'خصومات الموظفين' };

export default async function Page() {
  await guardRoute('/control/penalties');
  return <PenaltiesScreen />;
}
