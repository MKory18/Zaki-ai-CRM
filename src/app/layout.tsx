import './globals.css';

/**
 * THE ROOT — the document and nothing else.
 *
 * Every page used to render inside the dashboard's layout: its stylesheet,
 * its fonts, its title and its icon reached a shopper's landing page and a
 * seller's storefront. The root is neutral now. The system's pages dress
 * themselves in src/app/(system)/layout.tsx; the public pages (/lp, /s) in
 * their own layouts, from the page's store.
 *
 * suppressHydrationWarning: browser extensions (translate, dark mode,
 * password managers) mutate <html>/<body> before hydration.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className="h-full">
      <body suppressHydrationWarning className="min-h-full">
        {children}
      </body>
    </html>
  );
}
