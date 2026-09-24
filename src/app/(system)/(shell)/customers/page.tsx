import { guardRoute } from '@/lib/page-guard';
import { CustomersScreen } from '@/components/screens/CustomersScreen';

export default async function Page() {
  await guardRoute('/customers');
  return <CustomersScreen />;
}
