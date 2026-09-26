import type { Metadata, Viewport } from 'next';
import { SystemFrame } from './SystemFrame';
import { getCurrentUser } from '@/lib/auth';
import { themeByKey } from '@/lib/system-themes';
import { cookies } from 'next/headers';
import { RAIL_COOKIE } from '@/lib/sidebar-rail';
import { AppProvider } from '@/context/AppContext';
import { GlobalTrackingProvider } from '@/components/tracking/GlobalTrackingProvider';

export const metadata: Metadata = {
  title: 'Zaki AI OMS — نظام المبيعات والطلبات والأرباح الذكي',
  description:
    'Zaki AI OMS — منصة متكاملة لإدارة المنتجات والطلبات والمودريتورات والأرباح الحقيقية مع مستشار أعمال بالذكاء الاصطناعي.',
  icons: {
    icon: '/brand/mark.png',
    apple: '/icons/icon-192.png',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Zaki AI OMS' },
};

/**
 * `viewport-fit=cover` is what lets a notched phone hand us its safe-area
 * insets. Without it the bottom bar sits under the home indicator and its
 * tabs close the app instead of opening a screen.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * THE SYSTEM — the dashboard, the entry picker and the sign-in screens.
 *
 * Its look (system.css, its fonts, its title and icon) lives here and only
 * here, so none of it reaches a public page.
 */
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  /**
   * Was the sidebar left folded? A cookie, read here, so the attribute is
   * in the HTML the browser parses — no script, no flash, and no «Scripts
   * inside React components are never executed» in the console on every
   * page load. See src/lib/sidebar-rail.ts.
   */
  const railed = (await cookies()).get(RAIL_COOKIE)?.value === '1';

  return (
    <SystemFrame theme={user?.systemTheme} railed={railed}>
      {/* The status bar takes the colour of the theme this person chose, so
          an installed app does not wear the default's colour above a dark
          screen. */}
      <meta name="theme-color" content={themeByKey(user?.systemTheme).vars.sidebar} />

      <AppProvider initialUser={user}>
        {/* The engine starts empty. Pixels are registered by the selling
            page that renders — a landing page or a storefront page — with
            the pixels of the company that owns THAT page. The dashboard
            registers none. */}
        <GlobalTrackingProvider pixels={[]}>{children}</GlobalTrackingProvider>
      </AppProvider>
    </SystemFrame>
  );
}
