'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { DateRange } from '@/components/ui/DateRange';
import { OrderStateBadge } from '@/components/orders/OrderStateBadge';
import { CustomerHistoryButton } from '@/components/orders/CustomerHistory';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { AiOrderModal } from '@/components/orders/AiOrderModal';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { useApp } from '@/context/AppContext';
import { apiFetch } from '@/lib/api-client';
import {
  Search,
  RotateCcw,
  Clock,
  Filter,
  Download,
  Plus,
  RefreshCw,
  Phone,
  ChevronLeft,
  ChevronRight,
  Wand2,
  Bike,
  Truck,
} from 'lucide-react';
import { format } from 'date-fns';
import { ar as arLocale } from 'date-fns/locale';
import { FILTERABLE_STATES, STATE_LABEL_AR } from '@/lib/order-state';
import { formatMoney } from '@/lib/money';

export function OrdersScreen() {
  const { t, currentUser, locale } = useApp();
  const ar = locale === 'ar';
  const [orders, setOrders] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Filter States
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
  }, [search, status, productId, moderatorId, source, courierId, fromDate, toDate, lateOnly, queue]);

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
    (fromDate ? 1 : 0) + (toDate ? 1 : 0) + (lateOnly ? 1 : 0);

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
  const allOnPageSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const toggleAll = () =>
    setSelected(allOnPageSelected ? new Set() : new Set(orders.map((o) => o.id)));

  /** Export only the ticked rows, by id, through the same report endpoint. */
  const handleExportSelected = () => {
    if (selected.size === 0) return;
    const params = new URLSearchParams({ ids: [...selected].join(',') });
    window.open(`/api/reports/export?${params.toString()}`, '_blank');
  };

  const handleExportCSV = () => {
    // Export respects the current filters (same params as loadOrders)
    const params = new URLSearchParams({ q: search, status, productId, moderatorId, source });
    if (courierId !== 'all') params.set('courierId', courierId);
    if (queue) params.set('queue', queue);
    window.open(`/api/reports/export?${params.toString()}`, '_blank');
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.orders}</h1>
            <p className="text-xs text-[#697586] mt-1">
              كل الطلبات بحالتها ومَن يحملها — الحالة والفلتر يقرآن نفس الشيء
            </p>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse flex-wrap gap-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5"
            >
              <Download className="w-4 h-4" />
              <span>{t.export}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadOrders(pagination.page)}
              className="p-2"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              size="sm"
              onClick={() => setAiModalOpen(true)}
              className="flex items-center space-x-1.5 bg-[#fb323f] hover:bg-[#fb323f]/85"
            >
              <Wand2 className="w-4 h-4" />
              <span>إدخال بالذكاء الاصطناعي</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.quickCreateOrder}</span>
            </Button>
          </div>
        </div>

        {/* One bar, three rows that each answer a different question:
            which queue am I in, what am I looking for, and how do I narrow
            it. The old grid mixed all three into six equal cells. */}
        <div className="bg-white border border-[#e3e8ef] rounded-xl shadow-xs divide-y divide-[#e3e8ef]">
          {/* Queues — server-enforced per role */}
          <div className="flex flex-wrap gap-1.5 p-3">
            {[
              { key: '', ar: 'الكل' },
              { key: 'available', ar: 'متاح للاستلام' },
              { key: 'my_orders', ar: 'طلباتي' },
              { key: 'assigned_to_me', ar: 'مسندة لي' },
              { key: 'processing', ar: 'قيد المعالجة' },
              { key: 'all_company', ar: 'كل الشركة' },
            ].map((q) => (
              <button
                key={q.key || 'all'}
                onClick={() => setQueue(q.key)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                  queue === q.key
                    ? 'bg-[#b8256e] text-white border-[#b8256e]'
                    : 'bg-white text-[#364152] border-[#e3e8ef] hover:border-[#b8256e]/40 hover:text-[#b8256e]'
                }`}
              >
                {q.ar}
              </button>
            ))}
          </div>

          {/* Search — pressing Enter or the button runs it; it no longer
              fires on every keystroke, which made a long phone number send
              a request per digit. */}
          <div className="flex flex-wrap items-center gap-2 p-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
              <input
                type="text"
                placeholder="ابحث برقم الطلب، اسم العميل، أو الهاتف…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                className="w-full ps-9 pe-3 py-2 text-xs bg-[#f8fafc] border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e]"
              />
            </div>
            <Button size="sm" onClick={runSearch} className="shrink-0">
              <Search className="w-3.5 h-3.5" />
              بحث
            </Button>
            <Button
              size="sm"
              variant={lateOnly ? undefined : 'outline'}
              onClick={() => setLateOnly((v) => !v)}
              title="طلبات مضى عليها 10 أيام أو أكثر ولم تُغلق بعد"
              className="shrink-0"
            >
              <Clock className="w-3.5 h-3.5" />
              متأخرة 10 أيام+
            </Button>
            {activeFilters > 0 && (
              <Button size="sm" variant="outline" onClick={resetFilters} className="shrink-0 text-[#fb323f]">
                <RotateCcw className="w-3.5 h-3.5" />
                إعادة تعيين ({activeFilters})
              </Button>
            )}
          </div>

          {/* Narrowing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 p-3">
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
          <div className="rounded-xl border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2.5 text-xs flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-[#fdf5fa] border border-[#f2c9dd] rounded-xl px-4 py-2.5">
            <span className="text-xs font-semibold text-[#b8256e]">
              محدَّد: {selected.size} طلب
            </span>
            <Button size="sm" variant="outline" onClick={handleExportSelected} className="ms-auto">
              <Download className="w-3.5 h-3.5" />
              تصدير المحدَّد
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              إلغاء التحديد
            </Button>
          </div>
        )}

        {/* Orders — rows, not a table.
            Eleven columns could not fit any screen: the product name broke
            one word per line, the date stacked into three, and the whole
            thing scrolled sideways. A row that reflows says the same things
            in the order somebody reads them — who, what, where it stands,
            how much — and never runs off the edge. */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e3e8ef] bg-[#f8fafc] text-[11px] text-[#697586]">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleAll}
                aria-label="تحديد كل الطلبات في هذه الصفحة"
                className="w-4 h-4 accent-[#b8256e] cursor-pointer"
              />
              <span>{orders.length ? `${orders.length} طلب في هذه الصفحة` : ''}</span>
            </div>

            {orders.length === 0 ? (
              <p className="py-12 text-center text-sm text-[#9ca3af]">
                {loading ? t.loading : t.noOrders}
              </p>
            ) : (
              <ul className="divide-y divide-[#e3e8ef]">
                {orders.map((order) => (
                  <li
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      selected.has(order.id) ? 'bg-[#fdf5fa]' : 'hover:bg-[#f8fafc]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span onClick={(e) => e.stopPropagation()} className="pt-1 shrink-0">
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleRow(order.id)}
                          aria-label={`تحديد الطلب ${order.orderNumber}`}
                          className="w-4 h-4 accent-[#b8256e] cursor-pointer"
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
                          <span className="font-bold text-[#fb323f] text-xs" dir="ltr">{order.orderNumber}</span>
                          <OrderStateBadge state={order.state} />
                          {order.deliveryProvider && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#697586]">
                              {order.deliveryProvider.kind === 'AGENT' ? (
                                <Bike className="w-3 h-3 text-[#b8256e]" />
                              ) : (
                                <Truck className="w-3 h-3 text-[#9aa4b2]" />
                              )}
                              {order.deliveryProvider.name}
                            </span>
                          )}
                          {order.trackingNumber && (
                            <span className="text-[10px] font-mono text-[#9aa4b2]" dir="ltr">
                              {order.trackingNumber}
                            </span>
                          )}
                        </div>

                        {/* Line 2 — who it goes to. */}
                        <p className="text-sm text-[#121926] truncate">
                          {order.customer?.fullName}
                          <span className="text-[11px] text-[#697586]" dir="ltr">
                            {' · '}{order.customer?.rawPhone || order.customer?.phone}
                          </span>
                          <span className="text-[11px] text-[#9aa4b2]">
                            {' · '}{order.region?.name ?? order.customer?.city ?? '—'}
                          </span>
                        </p>

                        {/* Line 3 — what is in it. */}
                        <p className="text-xs text-[#697586] truncate">
                          {order.productNameSnapshot || order.product?.name}
                          <span className="text-[#9aa4b2]">
                            {' × '}{order.quantity}
                            {order.offer?.name ? ` · ${order.offer.name}` : ''}
                          </span>
                        </p>

                        {/* Line 4 — where it came from and when. */}
                        <p className="text-[11px] text-[#9aa4b2] truncate">
                          {order.source || '—'}
                          {order.moderator?.name ? ` · ${order.moderator.name}` : ''}
                          {' · '}
                          {format(new Date(order.createdAt), 'd MMMM yyyy · HH:mm', { locale: arLocale })}
                        </p>
                      </div>

                      {/* The money and the two things you do with a row. */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="font-bold text-[#121926] text-sm tabular-nums" dir="ltr">
                          {currency.code
                            ? formatMoney(Number(order.totalAmount || 0), currency.code, currency.minorUnit)
                            : Number(order.totalAmount || 0).toFixed(2)}
                        </span>
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
            <div className="px-6 py-3 border-t border-[#e3e8ef] flex items-center justify-between text-xs text-[#697586]">
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
                  <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
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
                  <ChevronRight className="w-4 h-4 rtl:rotate-180" />
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
