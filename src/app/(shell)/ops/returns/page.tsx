import { guardRoute } from '@/lib/page-guard';
import { UnderConstruction } from '@/components/shell/UnderConstruction';

export default async function Page() {
  const { route } = await guardRoute('/ops/returns');
  return <UnderConstruction route={route} />;
}
