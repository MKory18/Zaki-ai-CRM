import { redirect } from 'next/navigation';
import { guardRoute, requireShellContext } from '@/lib/page-guard';
import { can } from '@/lib/authorization';
import { canAccessRoute, findRoute } from '@/lib/route-registry';
import { ConfirmationFollowUpScreen } from '@/components/screens/ConfirmationFollowUpScreen';

/**
 * «المتابعة» — the supervisor's two lists (postponed, and cancelled-before).
 *
 * `/confirmation/postponed` redirects here for everybody (next.config.ts), so an
 * AGENT arrives here too, with a bookmark from before: her postponed orders are a
 * tab of «طلباتي» now, and she is taken there rather than to a refusal.
 */
export default async function Page() {
  const route = findRoute('/confirmation/follow-up');
  const { user } = await requireShellContext();
  if (!route || !canAccessRoute(user, route, can)) redirect('/confirmation/mine?tab=postponed');
  await guardRoute('/confirmation/follow-up');
  return <ConfirmationFollowUpScreen />;
}
