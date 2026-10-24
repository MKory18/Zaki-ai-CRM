import { redirect } from 'next/navigation';
import { guardRoute, requireShellContext } from '@/lib/page-guard';
import { can } from '@/lib/authorization';
import { canAccessRoute, findRoute } from '@/lib/route-registry';
import { ConfirmationQueueScreen } from '@/components/screens/ConfirmationQueueScreen';

/**
 * The supervisor's view of the pool. An agent used to land here to press one
 * button; the pull is at the top of «طلباتي» now, so an old bookmark, a pasted
 * link or a notification from before this change takes her there instead of
 * to a refusal. Anybody who may open neither is refused by «طلباتي» itself.
 */
export default async function Page() {
  const route = findRoute('/confirmation/queue');
  const { user } = await requireShellContext();
  if (!route || !canAccessRoute(user, route, can)) redirect('/confirmation/mine');
  await guardRoute('/confirmation/queue');
  return <ConfirmationQueueScreen />;
}
