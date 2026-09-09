import type { Metadata } from 'next';
import { Tajawal, Public_Sans } from 'next/font/google';
import './globals.css';
import { getCurrentUser } from '@/lib/auth';
import { AppProvider } from '@/context/AppContext';

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
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`h-full ${tajawal.variable} ${publicSans.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-[#f3f4f6] text-[#4b5675]"
      >
        <AppProvider initialUser={user}>{children}</AppProvider>
      </body>
    </html>
  );
}
