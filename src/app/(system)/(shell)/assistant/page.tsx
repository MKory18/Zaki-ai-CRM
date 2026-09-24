import { guardRoute } from '@/lib/page-guard';
import { AssistantScreen } from '@/components/screens/AssistantScreen';

export default async function Page() {
  await guardRoute('/assistant');
  return <AssistantScreen />;
}
