import type { Metadata } from 'next';
import { Tajawal } from 'next/font/google';
import './globals.css';
import { getCurrentUser } from '@/lib/auth';
import { AppProvider } from '@/context/AppContext';

const tajawal = Tajawal({
  variable: '--font-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
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

  return (
    <html lang="en" dir="ltr" className={`h-full ${tajawal.variable}`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <AppProvider initialUser={user}>{children}</AppProvider>
      </body>
    </html>
  );
}
