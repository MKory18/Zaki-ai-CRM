import { guardRoute } from '@/lib/page-guard';
import { UnderConstruction } from '@/components/shell/UnderConstruction';

export default async function Page() {
  const { route } = await guardRoute('/settings/delivery-fees');
  return <UnderConstruction route={route} />;
}
