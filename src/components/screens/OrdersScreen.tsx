'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { DateRange } from '@/components/ui/DateRange';
import { BulkBar } from '@/components/shell/BulkBar';
import { LabelSizePicker, useLabelSize } from '@/components/labels/LabelSize';
import { describeRefused, openWaybills, WaybillError } from '@/components/labels/openWaybills';
import { useTell } from '@/components/ui/Confirm';
import { ScanButton } from '@/components/scan/ScanButton';
import { userCan } from '@/lib/can';
import { useRegions } from '@/hooks/useRegions';
import { OrderStateBadge } from '@/components/orders/OrderStateBadge';
import { CustomerHistoryButton } from '@/components/orders/CustomerHistory';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { AiOrderModal } from '@/components/orders/AiOrderModal';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { useApp } from '@/context/AppContext';
import { apiFetch } from '@/lib/api-client';
import { format } from 'date-fns';
import { ar as arLocale } from 'date-fns/locale';
import { FILTERABLE_STATES, STATE_LABEL_AR } from '@/lib/order-state';
import { RiAddCircleLine, RiArrowGoBackLine, RiArrowLeftSLine, RiArrowRightSLine, RiDownload2Line, RiEBike2Line, RiFilter3Line, RiMagicLine, RiPrinterLine, RiRefreshLine, RiSearchLine, RiTimerLine, RiTruckLine } from '@remixicon/react';
import { Money } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';

export function OrdersScreen() {
  const { t, currentUser, locale } = useApp();
  const ar = locale === 'ar';
  const [orders, setOrders] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // RiFilter3Line States
  // What is typed, and what has actually been searched for. They used to be
  // one value, so every keystroke sent a request.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [productId, setProductId] = useState('all');
  const [moderatorId, setModeratorId] = useState('all');
  const [source, setSource] = useState('all');
  const [courierId, setCourierId] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [regionId, setRegionId] = useState('all');
  // The governorates of the selected country — the same list the order forms use.
  const { regions } = useRegions();
  /** Show everything the filter matches, not just this page. */
  const [showAll, setShowAll] = useState(false);
  const [sources, setSources] = useState<{ name: string; count: number }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Workflow queue (backend-enforced per role — server rejects unauthorized queues)
  const [queue, setQueue] = useState('');

  // Metadata dropdowns
  const [products, setProducts] = useState<any[]>([]);
  const [moderators, setModerators] = useState<any[]>([]);
  const [couriers, setCouriers] = useState<any[]>([]);
  // The store's own currency, sent with the list — never assumed.
  const [currency, setCurrency] = useState({ code: '', minorUnit: 2 });
  const [error, setError] = useState<string | null>(null);
  // ref mirror of pagination for polling without re-subscribing the interval
  const paginationRef = useRef({ page: 1 });
  useEffect(() => { paginationRef.current = pagination; }, [pagination]);
  // ref mirror of loadOrders so the 30s polling interval always calls the
  // latest closure (current filters) without re-subscribing the interval
  const loadOrdersRef = useRef<(page?: number) => Promise<void>>(async () => {});
  // Monotonic request counter — stale (out-of-order) responses are discarded
  // so an older poll can never overwrite a newer result
  const loadOrdersSeq = useRef(0);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const loadMetadata = async () => {
    try {
      const [pRes, mRes, cRes, sRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/moderators'),
        fetch('/api/delivery-providers'),
        fetch('/api/orders/sources'),
      ]);
      if (pRes.ok) {
        const pData = await pRes.json();
        setProducts(pData.products || []);
      }
      if (mRes.ok) {
        const mData = await mRes.json();
        setModerators(mData.moderators || []);
      }
      if (cRes.ok) {
        const cData = await cRes.json();
        setCouriers(cData.providers ?? cData.deliveryProviders ?? []);
      }
      if (sRes.ok) {
        const sData = await sRes.json();
        setSources(sData.sources ?? []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadOrders = useCallback(async (pageToLoad = 1) => {
    const seq = ++loadOrdersSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: pageToLoad.toString(),
        limit: '25',
        q: search,
        status,
        productId,
        moderatorId,
        source,
      });
      if (courierId !== 'all') params.set('courierId', courierId);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (lateOnly) params.set('lateDays', '10');
      if (regionId !== 'all') params.set('regionId', regionId);
      if (showAll) params.set('limit', '500');
      if (queue) params.set('queue', queue);

      const res = await apiFetch(`/api/orders?${params.toString()}`);
      // Discard stale response — a newer request (filter change / poll) started
      // while this one was in flight
      if (seq !== loadOrdersSeq.current) return;
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        // A tick on a row that is no longer listed means nothing.
        setSelected(new Set());
        if (data.currency) setCurrency(data.currency);
        setPagination(data.pagination || { total: 0, page: 1, limit: 25, totalPages: 1 });
      } else {
        // Show a visible error instead of silently keeping stale data
        // (401 is handled by apiFetch redirect)
        const data = await res.json().catch(() => ({}));
        setError(data.errorAr || data.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      if (seq !== loadOrdersSeq.current) return;
      console.error('Failed to load orders:', e);
      setError(e?.message || 'فشل تحميل الطلبات');
    } finally {
      // Only the latest request may clear the shared loading flag
      if (seq === loadOrdersSeq.current) setLoading(false);
    }
  }, [search, status, productId, moderatorId, source, courierId, regionId, fromDate, toDate, lateOnly, showAll, queue]);

  // Keep the ref in sync each render (after loadOrders exists)
  useEffect(() => { loadOrdersRef.current = loadOrders; }, [loadOrders]);

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadOrders]);

  // Light polling (30s) — keeps queues in sync (claims by others appear without
  // a manual refresh). No WebSockets needed; server RBAC stays the source of truth.
  // Mirrors the dashboard: on visibilitychange, returning to the tab refetches
  // immediately so data is fresh without waiting for the next tick.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) loadOrdersRef.current(paginationRef.current.page);
    }, 30_000);
    const onVisibility = () => {
      if (!document.hidden) loadOrdersRef.current(paginationRef.current.page);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /** Run the typed search. Nothing goes to the server until this. */
  const runSearch = () => setSearch(searchInput.trim());

  const activeFilters =
    (search ? 1 : 0) + (status !== 'all' ? 1 : 0) + (source !== 'all' ? 1 : 0) +
    (productId !== 'all' ? 1 : 0) + (courierId !== 'all' ? 1 : 0) +
    (fromDate ? 1 : 0) + (toDate ? 1 : 0) + (lateOnly ? 1 : 0) + (regionId !== 'all' ? 1 : 0);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('all');
    setSource('all');
    setProductId('all');
    setCourierId('all');
    setFromDate('');
    setToDate('');
    setLateOnly(false);
    setRegionId('all');
    setShowAll(false);
    setSelected(new Set());
  };

  /** Selection is per page: it clears whenever the rows underneath change. */
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const firstOnPage = orders.length ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const lastOnPage = (pagination.page - 1) * pagination.limit + orders.length;
  const allOnPageSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const toggleAll = () =>
    setSelected(allOnPageSelected ? new Set() : new Set(orders.map((o) => o.id)));

  /** Waybills for the ticked rows, on whatever paper this device prints on.
   *  The size used to be hard-coded here, so the same order came out
   *  thermal-sized from this screen and A4-sized from the labels screen. */
  const labelSize = useLabelSize();
  const tell = useTell();
  const [printing, setPrinting] = useState(false);
  const canPrint = userCan(currentUser, 'ops.labels');
  /**
   * Only confirmed orders with a courier get a waybill — printing seals an
   * order. The ones that were ticked and cannot be printed are named, not
   * silently left out of the stack of paper.
   */
  const handlePrintLabels = async (mode: 'print' | 'pdf' = 'print') => {
    if (selected.size === 0) return;
    setPrinting(true);
    setError(null);
    try {
      const out = await openWaybills({ orderIds: [...selected], ...labelSize.dims }, mode);
      if (out.refused.length) {
        void tell({
          title: `جُهِّزت ${out.count} بوليصة، ولم تُجهَّز ${out.refused.length}`,
          body: `لا يُطبع إلا طلب مؤكَّد له شركة شحن:\n${describeRefused(out.refused)}`,
        });
      }
    } catch (e) {
      if (e instanceof WaybillError && e.refused.length) {
        void tell({ title: e.message, body: describeRefused(e.refused), tone: 'danger' });
      } else {
        setError(e instanceof Error ? e.message : 'تعذر تجهيز البوالص');
      }
    } finally {
      setPrinting(false);
    }
  };

  /** Export only the ticked rows, by id, through the same report endpoint. */
  const handleExportSelected = () => {
    if (selected.size === 0) return;
    const params = new URLSearchParams({ ids: [...selected].join(',') });
    window.open(`/api/reports/export?${params.toString()}`, '_blank');
  };

  /** Everything the filters match — not the page in front of you. */
  const handleExportCSV = () => {
    const params = new URLSearchParams({ q: search, status, productId, moderatorId, source });
    if (courierId !== 'all') params.set('courierId', courierId);
    if (regionId !== 'all') params.set('regionId', regionId);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    if (lateOnly) params.set('lateDays', '10');
    if (queue) params.set('queue', queue);
    window.open(`/api/reports/export?${params.toString()}`, '_blank');
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader title={t.orders}
            description="كل الطلبات بحالتها ومَن يحملها — الحالة والفلتر يقرآن نفس الشيء"
            actions={
              <><div className="flex items-center space-x-2 rtl:space-x-reverse flex-wrap gap-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5"
            >
              <RiDownload2Line className="w-4 h-4" />
              <span>{t.export}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadOrders(pagination.page)}
              className="p-2"
              title="Refresh"
            >
              <RiRefreshLine className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setAiModalOpen(true)}
              className="items-center gap-1.5 text-[var(--sys-primary)] border-[var(--sys-primary)]/35 hover:bg-[var(--sys-primary-soft)]"
            >
              <RiMagicLine className="w-4 h-4" />
              <span>إدخال بالذكاء الاصطناعي</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center space-x-1.5"
            >
              <RiAddCircleLine className="w-4 h-4" />
              <span>{t.quickCreateOrder}</span>
            </Button>
          </div></>
            }
          />

        {/* One bar, three rows that each answer a different question:
            which queue am I in, what am I looking for, and how do I narrow
            it. The old grid mixed all three into six equal cells. */}
        <div className="bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg shadow-raised divide-y divide-[var(--sys-border)]">
          {/* RiSearchLine — pressing Enter or the button runs it; it no longer
              fires on every keystroke, which made a long phone number send
              a request per digit. */}
          <div className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative flex-1 min-w-[220px]">
              <RiSearchLine className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sys-muted)]" />
              <input
                type="text"
                placeholder="ابحث برقم الطلب، الباركود، اسم العميل، أو الهاتف…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                className="h-10 w-full ps-9 pe-3 text-sm bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/30 focus:border-[var(--sys-primary)]"
              />
            </div>
            <Button onClick={runSearch} className="shrink-0 gap-1.5">
              <RiSearchLine className="w-4 h-4" />
              بحث
            </Button>
            {/* The camera fills the same box a person types into, and the
                same request goes out. A scan is a search — it sees exactly
                the orders this account may see, and nothing more. */}
            <ScanButton
              title="امسح بوليصة الطلب"
              onScan={(code) => {
                setSearchInput(code);
                setSearch(code);
              }}
              className="shrink-0 h-10 px-4 rounded-lg border border-[var(--sys-border)] text-sm text-[var(--sys-muted-foreground)] hover:text-[var(--sys-primary)] inline-flex items-center gap-1.5"
            />
            <Button
              variant={lateOnly ? undefined : 'outline'}
              onClick={() => setLateOnly((v) => !v)}
              title="شُحنت منذ 10 أيام أو أكثر ولم تُسلَّم بعد — من تاريخ الشحن"
              className="shrink-0 gap-1.5"
            >
              <RiTimerLine className="w-4 h-4" />
              متأخرة 10 أيام+ من الشحن
            </Button>
            {activeFilters > 0 && (
              <Button variant="outline" onClick={resetFilters} className="shrink-0 gap-1.5 text-[var(--sys-destructive)]">
                <RiArrowGoBackLine className="icon-mirror w-4 h-4" />
                إعادة تعيين ({activeFilters})
              </Button>
            )}
          </div>

          {/* Narrowing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 p-3">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="text-xs py-2">
              <option value="all">كل الحالات</option>
              {FILTERABLE_STATES.map((st) => (
                <option key={st} value={st}>{STATE_LABEL_AR[st]}</option>
              ))}
            </Select>

            <Select value={source} onChange={(e) => setSource(e.target.value)} className="text-xs py-2">
              <option value="all">كل الجهات</option>
              {sources.map((sc) => (
                <option key={sc.name} value={sc.name}>{sc.name} ({sc.count})</option>
              ))}
            </Select>

            <Select value={productId} onChange={(e) => setProductId(e.target.value)} className="text-xs py-2">
              <option value="all">كل المنتجات</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>

            <Select value={regionId} onChange={(e) => setRegionId(e.target.value)} className="text-xs py-2">
              <option value="all">كل المحافظات</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>

            <Select value={courierId} onChange={(e) => setCourierId(e.target.value)} className="text-xs py-2">
              <option value="all">كل شركات الشحن</option>
              <option value="none">بلا شركة شحن بعد</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind === 'AGENT' ? `مندوب · ${c.name}` : c.name}
                </option>
              ))}
            </Select>

            <DateRange
              label="تاريخ الطلب"
              value={{ from: fromDate, to: toDate }}
              onChange={(r) => { setFromDate(r.from); setToDate(r.to); }}
            />
          </div>
        </div>

        {/* Load error banner */}
        {error && (
          <div className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] text-[var(--sys-destructive)] px-3 py-2.5 text-xs flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
          </div>
        )}

        {/* On a desk this sits where it always has. On a phone the shell
            hands it the bottom strip, because selecting five rows and then
            scrolling four screens up to act on them is why nobody did. */}
        <BulkBar show={selected.size > 0}>
          <>
            <span className="text-xs font-semibold text-[var(--sys-primary)]">
              محدَّد: {selected.size} طلب
            </span>
            {/* The paper sits beside the button that uses it, so nobody
                prints thirty labels before discovering the size. */}
            <LabelSizePicker compact className="ms-auto flex items-center" />
            {/* Shown only to whoever may print: the server refuses anyone
                else, and a button that always answers 403 is a broken one. */}
            {canPrint && (
              <>
                <Button size="sm" variant="outline" onClick={() => void handlePrintLabels('print')} loading={printing}>
                  <RiPrinterLine className="w-4 h-4" />
                  طباعة البوالص
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handlePrintLabels('pdf')}
                  disabled={printing}
                  title="نفس البوالص كملف PDF — الحفظ لا يعلّم الطلبات مطبوعة"
                >
                  <RiDownload2Line className="w-4 h-4" />
                  PDF
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={handleExportSelected}>
              <RiDownload2Line className="w-4 h-4" />
              تصدير المحدَّد
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              إلغاء التحديد
            </Button>
          </>
        </BulkBar>

        {/* Orders — rows, not a table.
            Eleven columns could not fit any screen: the product name broke
            one word per line, the date stacked into three, and the whole
            thing scrolled sideways. A row that reflows says the same things
            in the order somebody reads them — who, what, where it stands,
            how much — and never runs off the edge. */}
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-[var(--sys-border)] bg-[var(--sys-surface)] text-xs text-[var(--sys-muted-foreground)]">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleAll}
                aria-label="تحديد كل الطلبات في هذه الصفحة"
                className="w-4 h-4 accent-[var(--sys-primary)] cursor-pointer"
              />
              {orders.length > 0 && (
                <span className="tabular-nums">
                  عرض {firstOnPage}–{lastOnPage} من أصل {pagination.total} طلب
                  {activeFilters > 0 && <span className="text-[var(--sys-primary)]"> (مفلترة)</span>}
                </span>
              )}
              {/* Twenty-five at a time is right for reading and wrong for
                  acting: printing or exporting a filtered batch means having
                  all of it in front of you. */}
              {!showAll && pagination.totalPages > 1 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="ms-auto text-xs font-medium text-[var(--sys-primary)] hover:underline"
                >
                  إظهار كل النتائج ({pagination.total})
                </button>
              )}
              {showAll && (
                <button
                  onClick={() => setShowAll(false)}
                  className="ms-auto text-xs font-medium text-[var(--sys-muted-foreground)] hover:underline"
                >
                  العودة للعرض بالصفحات
                </button>
              )}
            </div>

            {orders.length === 0 ? (
              <p className="py-12 text-center text-sm text-[var(--sys-muted)]">
                {loading ? t.loading : t.noOrders}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--sys-border)]">
                {orders.map((order) => (
                  <li
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      selected.has(order.id) ? 'bg-[var(--sys-primary-soft)]' : 'hover:bg-[var(--sys-surface)]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span onClick={(e) => e.stopPropagation()} className="pt-1 shrink-0">
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleRow(order.id)}
                          aria-label={`تحديد الطلب ${order.orderNumber}`}
                          className="w-4 h-4 accent-[var(--sys-primary)] cursor-pointer"
                        />
                      </span>

                      <ProductThumb
                        src={order.productImageSnapshot || order.product?.image}
                        alt={order.productNameSnapshot || order.product?.name}
                        size="md"
                      />

                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Line 1 — which order, and where it stands. */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold text-[var(--sys-heading)] text-xs" dir="ltr">{order.orderNumber}</span>
                          <OrderStateBadge state={order.state} />
                          {order.deliveryProvider && (
                            <span className="inline-flex items-center gap-1 text-xs text-[var(--sys-muted-foreground)]">
                              {order.deliveryProvider.kind === 'AGENT' ? (
                                <RiEBike2Line className="w-4 h-4 text-[var(--sys-primary)]" />
                              ) : (
                                <RiTruckLine className="w-4 h-4 text-[var(--sys-muted)]" />
                              )}
                              {order.deliveryProvider.name}
                            </span>
                          )}
                          {order.trackingNumber && (
                            <span className="text-xs font-mono text-[var(--sys-muted)]" dir="ltr">
                              {order.trackingNumber}
                            </span>
                          )}
                        </div>

                        {/* Line 2 — who it goes to. */}
                        <p className="text-sm text-[var(--sys-heading)] truncate">
                          {order.customer?.fullName}
                          <span className="text-xs text-[var(--sys-muted-foreground)]" dir="ltr">
                            {' · '}{order.customer?.rawPhone || order.customer?.phone}
                          </span>
                          <span className="text-xs text-[var(--sys-muted)]">
                            {' · '}{order.region?.name ?? order.customer?.city ?? '—'}
                          </span>
                        </p>

                        {/* Line 3 — what is in it. */}
                        <p className="text-xs text-[var(--sys-muted-foreground)] truncate">
                          {order.productNameSnapshot || order.product?.name}
                          <span className="text-[var(--sys-muted)]">
                            {' × '}{order.quantity}
                            {order.offer?.name ? ` · ${order.offer.name}` : ''}
                          </span>
                        </p>

                        {/* Line 4 — where it came from and when. */}
                        <p className="text-xs text-[var(--sys-muted)] truncate">
                          {order.source || '—'}
                          {order.moderator?.name ? ` · ${order.moderator.name}` : ''}
                          {' · '}
                          {format(new Date(order.createdAt), 'd MMMM yyyy · HH:mm', { locale: arLocale })}
                        </p>
                      </div>

                      {/* The money and the two things you do with a row. */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Money
                          value={order.totalAmount}
                          currency={currency.code || undefined}
                          minorUnit={currency.code ? currency.minorUnit : undefined}
                          className="font-bold text-[var(--sys-heading)] text-sm"
                        />
                        <span onClick={(e) => e.stopPropagation()}>
                          <CustomerHistoryButton
                            customerId={order.customer?.id}
                            orderId={order.id}
                            previousOrders={order.previousOrders ?? 0}
                          />
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Pagination Bar */}
            <div className="px-6 py-3 border-t border-[var(--sys-border)] flex items-center justify-between text-xs text-[var(--sys-muted-foreground)]">
              <span>
                عرض <strong>{orders.length}</strong> من <strong>{pagination.total}</strong> طلب
              </span>

              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page <= 1}
                  onClick={() => loadOrders(pagination.page - 1)}
                  className="p-1.5"
                >
                  <RiArrowLeftSLine className="icon-mirror w-4 h-4" />
                </Button>
                <span className="font-medium">
                  صفحة {pagination.page} من {pagination.totalPages || 1}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadOrders(pagination.page + 1)}
                  className="p-1.5"
                >
                  <RiArrowRightSLine className="icon-mirror w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <CreateOrderModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => loadOrders(1)}
      />

      <AiOrderModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onSuccess={() => loadOrders(1)}
      />

      <OrderDetailModal
        orderId={selectedOrderId}
        isOpen={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
        onRefresh={() => loadOrders(pagination.page)}
        filters={{ q: search, status, productId, moderatorId, queue, source }}
      />
    </>
  );
}
