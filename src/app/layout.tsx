import type { Metadata } from 'next';
import { Tajawal, Public_Sans } from 'next/font/google';
import './globals.css';
import { getCurrentUser } from '@/lib/auth';
import { AppProvider } from '@/context/AppContext';
import { GlobalTrackingProvider } from '@/components/tracking/GlobalTrackingProvider';

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
          {/* The engine starts empty. Pixels are registered by the selling
              page that renders — a landing page or a storefront page — with
              the pixels of the company that owns THAT page. The dashboard
              registers none: it used to load the signed-in company's pixels
              on every admin screen (and a guessed "first company's" on the
              login page), reporting a seller's own clicks as visits. */}
          <GlobalTrackingProvider pixels={[]}>{children}</GlobalTrackingProvider>
        </AppProvider>
      </body>
    </html>
  );
}
