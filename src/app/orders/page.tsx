'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, Input } from '@/components/ui/Input';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { AiOrderModal } from '@/components/orders/AiOrderModal';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { useApp } from '@/context/AppContext';
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
} from 'lucide-react';
import { format } from 'date-fns';

export default function OrdersPage() {
  const { t } = useApp();
  const [orders, setOrders] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [productId, setProductId] = useState('all');
  const [moderatorId, setModeratorId] = useState('all');

  // Metadata dropdowns
  const [products, setProducts] = useState<any[]>([]);
  const [moderators, setModerators] = useState<any[]>([]);

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
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageToLoad.toString(),
        limit: '25',
        q: search,
        status,
        productId,
        moderatorId,
      });

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 25, totalPages: 1 });
      }
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setLoading(false);
    }
  }, [search, status, productId, moderatorId]);

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadOrders]);

  const handleExportCSV = () => {
    window.open('/api/reports/export', '_blank');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.orders}</h1>
            <p className="text-xs text-slate-500 mt-1">
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
              className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-700"
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
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t.searchOrders}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
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
        </div>

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">{t.thOrderNumber}</th>
                    <th className="px-6 py-3.5">{t.thCustomer}</th>
                    <th className="px-6 py-3.5">{t.thProduct} & {t.thOffer}</th>
                    <th className="px-6 py-3.5">{t.thTotal} ($)</th>
                    <th className="px-6 py-3.5">{t.status}</th>
                    <th className="px-6 py-3.5">{t.thModerator}</th>
                    <th className="px-6 py-3.5">{t.thDate}</th>
                    <th className="px-6 py-3.5 text-right rtl:text-left">{t.thActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        {loading ? t.loading : t.noOrders}
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedOrderId(order.id)}
                      >
                        <td className="px-6 py-3.5">
                          <span className="font-bold text-red-600 block">
                            {order.orderNumber}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {order.source}
                          </span>
                        </td>

                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-slate-900">{order.customer?.fullName}</p>
                          <div className="flex items-center space-x-1 mt-0.5">
                            <span className="font-mono text-[11px] text-slate-500">
                              {order.customer?.rawPhone || order.customer?.phone}
                            </span>
                            <span className="text-[11px] text-slate-400">• {order.customer?.city}</span>
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
                              <p className="font-medium text-slate-800">{order.productNameSnapshot || order.product?.name}</p>
                              <p className="text-[11px] text-slate-400">
                                {order.offer?.name || 'قياسي'} ({order.quantity} وحدة)
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-3.5 font-bold text-slate-900">
                          ${order.totalAmount.toFixed(2)}
                        </td>

                        <td className="px-6 py-3.5">
                          <OrderStatusBadge status={order.status} />
                        </td>

                        <td className="px-6 py-3.5">
                          <span className="font-medium text-slate-700 block">
                            {order.moderator?.name || 'Unassigned'}
                          </span>
                        </td>

                        <td className="px-6 py-3.5 text-slate-400">
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
            <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
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
      />
    </AppLayout>
  );
}
