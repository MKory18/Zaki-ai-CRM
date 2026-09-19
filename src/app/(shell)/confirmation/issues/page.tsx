import { guardRoute } from '@/lib/page-guard';
import { UnderConstruction } from '@/components/shell/UnderConstruction';

export default async function Page() {
  const { route } = await guardRoute('/confirmation/issues');
  return <UnderConstruction route={route} />;
}
