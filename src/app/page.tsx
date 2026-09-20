import { redirect } from 'next/navigation';
import { requireActiveUser } from '@/lib/page-guard';
import { landingRoute } from '@/lib/route-registry';

/**
 * Entry point: the dashboard for anyone who may open it, and for everyone
 * else the first screen their permissions actually allow — a moderator who
 * only works his own orders holds no dashboard.view and would otherwise be
 * met by a 403 the moment he logs in.
 */
export default async function Home() {
  const { user } = await requireActiveUser();
  redirect(landingRoute(user));
}
