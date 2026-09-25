import { guardRoute } from '@/lib/page-guard';
import { StoreDesignScreen } from '@/components/screens/StoreDesignScreen';

export default async function Page() {
  await guardRoute('/store/design');
  return <StoreDesignScreen />;
}
