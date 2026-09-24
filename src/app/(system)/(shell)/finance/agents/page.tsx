import { guardRoute } from '@/lib/page-guard';
import { AgentCustodyScreen } from '@/components/screens/AgentCustodyScreen';

export default async function Page() {
  await guardRoute('/finance/agents');
  return <AgentCustodyScreen />;
}
