import type { Metadata } from 'next';
import { Tajawal, Public_Sans } from 'next/font/google';
import './globals.css';
import { getCurrentUser } from '@/lib/auth';
import { AppProvider } from '@/context/AppContext';
import { GlobalTrackingProvider } from '@/components/tracking/GlobalTrackingProvider';
import { getSiteTrackingPixels } from '@/lib/tracking/tracking-config';

const tajawal = Tajawal({
  variable: '--font-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
});

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Zaki AI Store — نظام المبيعات والطلبات والأرباح الذكي',
  description:
    'Zaki AI Store — منصة متكاملة لإدارة المنتجات والطلبات والمودريتورات والأرباح الحقيقية مع مستشار أعمال بالذكاء الاصطناعي.',
  icons: { icon: '/logo.svg' },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // Central tracking config — GLOBAL + PUBLIC pixels of the company.
  // Server-resolved scope; empty list → the provider is a pure no-op.
  // On public pages (no session) it falls back to the single company.
  const trackingPixels = await getSiteTrackingPixels(user?.companyId ?? null);

  // suppressHydrationWarning: browser extensions (translate/dark-mode/password
  // managers) mutate <html>/<body> before hydration — React must not warn.
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`h-full ${tajawal.variable} ${publicSans.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-[#f8fafc] text-[#364152]"
      >
        <AppProvider initialUser={user}>
          <GlobalTrackingProvider pixels={trackingPixels}>{children}</GlobalTrackingProvider>
        </AppProvider>
      </body>
    </html>
  );
}
