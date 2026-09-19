import { guardRoute } from '@/lib/page-guard';
import { UnderConstruction } from '@/components/shell/UnderConstruction';

export default async function Page() {
  const { route } = await guardRoute('/inventory/receiving');
  return <UnderConstruction route={route} />;
}
