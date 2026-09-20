'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/Input';
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

export function OrdersScreen() {
  const { t, currentUser, locale } = useApp();
  const ar = locale === 'ar';
  const [orders, setOrders] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [productId, setProductId] = useState('all');
  const [moderatorId, setModeratorId] = useState('all');
  const [source, setSource] = useState('all');
  // Workflow queue (backend-enforced per role — server rejects unauthorized queues)
  const [queue, setQueue] = useState('');

  // Metadata dropdowns
  const [products, setProducts] = useState<any[]>([]);
  const [moderators, setModerators] = useState<any[]>([]);
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
      const [pRes, mRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/moderators'),
      ]);
      if (pRes.ok) {
        const pData = await pRes.json();
        setProducts(pData.products || []);
      }
      if (mRes.ok) {
        const mData = await mRes.json();
        setModerators(mData.moderators || []);
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
      if (queue) params.set('queue', queue);

      const res = await apiFetch(`/api/orders?${params.toString()}`);
      // Discard stale response — a newer request (filter change / poll) started
      // while this one was in flight
      if (seq !== loadOrdersSeq.current) return;
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
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
  }, [search, status, productId, moderatorId, source, queue]);

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

  const handleExportCSV = () => {
    // Export respects the current filters (same params as loadOrders)
    const params = new URLSearchParams({ q: search, status, productId, moderatorId, source });
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
              Complete order tracking, moderator calls, status transitions & fulfillment
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

        {/* Filters & Search Bar */}
        <div className="bg-white border border-[#e3e8ef] rounded-xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Workflow queue tabs (server-enforced per role) */}
          <div className="sm:col-span-2 flex flex-wrap gap-1.5">
            {[
              { key: '', ar: 'الكل', en: 'All' },
              { key: 'available', ar: '🟢 متاح للاستلام', en: '🟢 Available' },
              { key: 'my_orders', ar: '🔵 طلباتي', en: '🔵 My Orders' },
              { key: 'assigned_to_me', ar: '🟡 مسندة لي', en: '🟡 Assigned to Me' },
              { key: 'processing', ar: '⚙️ قيد المعالجة', en: '⚙️ Processing' },
              { key: 'all_company', ar: '🏢 كل الشركة', en: '🏢 All Company' },
            ].map((q) => (
              <button
                key={q.key || 'all'}
                onClick={() => { setQueue(q.key); }}
                className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                  queue === q.key
                    ? 'bg-[#b8256e] text-white border-[#b8256e]'
                    : 'bg-white text-[#364152] border-[#e3e8ef] hover:border-[#b8256e]/40 hover:text-[#b8256e]'
                }`}
              >
                {ar ? q.ar : q.en}
              </button>
            ))}
          </div>
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder={t.searchOrders}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 text-xs bg-[#f8fafc] border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e]"
            />
          </div>

          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-xs py-2"
          >
            <option value="all">{t.allStatuses}</option>
            <option value="NEW">NEW</option>
            <option value="CONTACTING">CONTACTING</option>
            <option value="NO_ANSWER">NO_ANSWER</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="POSTPONED">POSTPONED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="READY_FOR_SHIPPING">READY_FOR_SHIPPING</option>
            <option value="SHIPPED">SHIPPED</option>
            <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="RETURNED">RETURNED</option>
          </Select>

          <Select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="text-xs py-2"
          >
            <option value="all">{t.allProducts}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Select
            value={moderatorId}
            onChange={(e) => setModeratorId(e.target.value)}
            className="text-xs py-2"
          >
            <option value="all">{t.allModerators}</option>
            {moderators.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>

          <Select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="text-xs py-2"
          >
            <option value="all">كل المصادر</option>
            <option value="Manual">Manual</option>
            <option value="Facebook Ads">Facebook Ads</option>
            <option value="Messenger">Messenger</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Telegram">Telegram</option>
            <option value="AI">AI</option>
            <option value="Landing Page">Landing Page</option>
            <option value="Website">Website</option>
            <option value="TikTok">TikTok</option>
            <option value="Instagram">Instagram</option>
          </Select>
        </div>

        {/* Load error banner */}
        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2.5 text-xs flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
          </div>
        )}

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">{t.thOrderNumber}</th>
                    <th className="px-6 py-3.5">{t.thCustomer}</th>
                    <th className="px-6 py-3.5">{t.thProduct} & {t.thOffer}</th>
                    <th className="px-6 py-3.5">{t.thTotal} ($)</th>
                    <th className="px-6 py-3.5">{t.status}</th>
                    <th className="px-6 py-3.5">السجل</th>
                    <th className="px-6 py-3.5">{t.thModerator}</th>
                    <th className="px-6 py-3.5">{t.thDate}</th>
                    <th className="px-6 py-3.5 text-right rtl:text-left">{t.thActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#9ca3af]">
                        {loading ? t.loading : t.noOrders}
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-[#f8fafc] transition-colors cursor-pointer"
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        <td className="px-6 py-3.5">
                          <span className="font-bold text-[#fb323f] block">
                            {order.orderNumber}
                          </span>
                          <span className="text-[10px] text-[#9ca3af] block mt-0.5">
                            {order.source}
                          </span>
                        </td>

                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-[#121926]">{order.customer?.fullName}</p>
                          <div className="flex items-center space-x-1 mt-0.5">
                            <span className="font-mono text-[11px] text-[#697586]">
                              {order.customer?.rawPhone || order.customer?.phone}
                            </span>
                            <span className="text-[11px] text-[#9ca3af]">
                              • {order.region?.name ?? order.customer?.city ?? '—'}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-3.5">
                          <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
                            <ProductThumb
                              src={order.productImageSnapshot || order.product?.image}
                              alt={order.productNameSnapshot || order.product?.name}
                              size="sm"
                            />
                            <div>
                              <p className="font-medium text-[#121926]">{order.productNameSnapshot || order.product?.name}</p>
                              <p className="text-[11px] text-[#9ca3af]">
                                {order.offer?.name || 'قياسي'} ({order.quantity} وحدة)
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-3.5 font-bold text-[#121926]">
                          ${Number(order.totalAmount || 0).toFixed(2)}
                        </td>

                        <td className="px-6 py-3.5">
                          {/* The derived state, the same one every other screen shows */}
                          <OrderStateBadge state={order.state} />
                          {order.deliveryProvider && (
                            <span className="mt-1 flex items-center gap-1 text-[10px] text-[#9ca3af]">
                              {order.deliveryProvider.kind === 'AGENT' ? (
                                <Bike className="w-3 h-3 text-[#b8256e]" />
                              ) : (
                                <Truck className="w-3 h-3" />
                              )}
                              {order.deliveryProvider.name}
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-3.5">
                          <CustomerHistoryButton
                            customerId={order.customer?.id}
                            orderId={order.id}
                            previousOrders={order.previousOrders ?? 0}
                          />
                        </td>

                        <td className="px-6 py-3.5">
                          <span className="font-medium text-[#364152] block">
                            {order.moderator?.name || 'Unassigned'}
                          </span>
                        </td>

                        <td className="px-6 py-3.5 text-[#9ca3af]">
                          {format(new Date(order.createdAt), 'MMM d, yyyy p')}
                        </td>

                        <td className="px-6 py-3.5 text-right rtl:text-left">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrderId(order.id);
                            }}
                          >
                            {t.detailsAndCalls}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            <div className="px-6 py-3 border-t border-[#e3e8ef] flex items-center justify-between text-xs text-[#697586]">
              <span>
                Showing <strong>{orders.length}</strong> of <strong>{pagination.total}</strong> orders
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
                  Page {pagination.page} of {pagination.totalPages || 1}
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
