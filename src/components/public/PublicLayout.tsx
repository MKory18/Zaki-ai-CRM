import { GlobalTrackingProvider } from '@/components/tracking/GlobalTrackingProvider';

/**
 * WHAT A PUBLIC PAGE RENDERS IN — a landing page, a storefront.
 *
 * Only the tracking engine, which starts empty and receives the pixels of
 * the company that owns the page being shown. No stylesheet, font, title or
 * icon of the dashboard's: a page is dressed by its own theme (--lp-*), and
 * named and iconed by its own store.
 */
export function PublicLayout({ children }: { children: React.ReactNode }) {
  return <GlobalTrackingProvider pixels={[]}>{children}</GlobalTrackingProvider>;
}

/**
 * A public address with nothing behind it — an ended offer, a closed shop.
 *
 * The shopper met the DASHBOARD's 404 here ("not among the system's
 * screens", with a button into the dashboard). They get a plain page that
 * says the offer is not available, in no one's brand.
 */
export function PublicNotFound() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#fafafa', color: '#1f2937', fontFamily: 'system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>هذه الصفحة غير متاحة الآن</h1>
        <p style={{ fontSize: 15, lineHeight: 1.8, margin: 0, color: '#6b7280' }}>
          ربما انتهى العرض أو تغيّر رابطه. إن وصلت من إعلان، تواصل مع صاحب المتجر.
        </p>
      </div>
    </main>
  );
}
