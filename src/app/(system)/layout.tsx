import type { Metadata } from 'next';
import { SystemFrame } from './SystemFrame';
import { getCurrentUser } from '@/lib/auth';
import { AppProvider } from '@/context/AppContext';
import { GlobalTrackingProvider } from '@/components/tracking/GlobalTrackingProvider';

export const metadata: Metadata = {
  title: 'Zaki AI Store — نظام المبيعات والطلبات والأرباح الذكي',
  description:
    'Zaki AI Store — منصة متكاملة لإدارة المنتجات والطلبات والمودريتورات والأرباح الحقيقية مع مستشار أعمال بالذكاء الاصطناعي.',
  icons: { icon: '/logo.svg' },
};

/**
 * THE SYSTEM — the dashboard, the entry picker and the sign-in screens.
 *
 * Its look (system.css, its fonts, its title and icon) lives here and only
 * here, so none of it reaches a public page.
 */
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <SystemFrame>
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
