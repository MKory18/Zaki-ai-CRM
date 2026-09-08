'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { Boxes, ArrowDownUp, Plus, History } from 'lucide-react';
import { format } from 'date-fns';

export default function InventoryPage() {
  const { t } = useApp();
  const [stockSummary, setStockSummary] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);

  // Adjustment State
  const [productId, setProductId] = useState('');
  const [adjustQty, setAdjustQty] = useState(10);
  const [type, setType] = useState('MANUAL_ADJUSTMENT');
  const [reason, setReason] = useState('Stock count verification');
  const [modalLoading, setModalLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory');
      if (res.ok) {
        const data = await res.json();
        setStockSummary(data.stockSummary || []);
        setMovements(data.movements || []);
        if (data.stockSummary?.length > 0 && !productId) {
          setProductId(data.stockSummary[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: adjustQty, type, reason }),
      });
      if (res.ok) {
        setAdjustModalOpen(false);
        loadData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#252f4a]">{t.inventory}</h1>
            <p className="text-xs text-[#6b7177] mt-1">
              Section 6 Movement tracking: Production additions, delivery deductions, returns & adjustments
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setAdjustModalOpen(true)}
            className="flex items-center space-x-1.5"
          >
            <ArrowDownUp className="w-4 h-4" />
            <span>Manual Stock Adjustment</span>
          </Button>
        </div>

        {/* Stock Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stockSummary.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#d13b4c] bg-[#fbe9ea] px-2 py-0.5 rounded">
                      {s.sku}
                    </span>
                    <h3 className="font-bold text-[#252f4a] text-sm mt-1">{s.name}</h3>
                  </div>
                  <Badge variant={s.remaining > 50 ? 'success' : 'danger'}>
                    {s.remaining > 50 ? 'In Stock' : 'Low Stock'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                  <div className="bg-[#f8f9fa] p-2 rounded-lg">
                    <span className="text-[#9ca3af] block text-[10px]">Produced</span>
                    <span className="font-bold text-[#252f4a]">{s.produced}</span>
                  </div>
                  <div className="bg-[#fbe9ea] p-2 rounded-lg">
                    <span className="text-[#d13b4c] block text-[10px]">Sold</span>
                    <span className="font-bold text-[#d13b4c]">{s.sold}</span>
                  </div>
                  <div className="bg-[#fbe9ea] p-2 rounded-lg">
                    <span className="text-[#d13b4c] block text-[10px]">Remaining</span>
                    <span className="font-black text-[#d13b4c]">{s.remaining}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Inventory Movements Audit Table */}
        <Card>
          <CardHeader
            title="Stock Movement History"
            subtitle="Transparent audit trail of every stock increase, sale dispatch, return, and warehouse count"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8f9fa] border-b border-[#eef0f3] text-[#6b7177] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Product</th>
                    <th className="px-6 py-3.5">Batch</th>
                    <th className="px-6 py-3.5">Movement Type</th>
                    <th className="px-6 py-3.5">Change</th>
                    <th className="px-6 py-3.5">Balance After</th>
                    <th className="px-6 py-3.5">Reason / Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0f3]">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-[#f8f9fa] transition-colors">
                      <td className="px-6 py-3.5 text-[#6b7177] font-mono">
                        {format(new Date(m.createdAt), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-[#252f4a]">
                        {m.product?.name}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-[#6b7177]">
                        {m.batch?.batchNumber || '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge
                          variant={
                            m.type === 'PRODUCTION'
                              ? 'success'
                              : m.type === 'SALE'
                              ? 'info'
                              : 'purple'
                          }
                        >
                          {m.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 font-bold">
                        <span className={m.quantity > 0 ? 'text-[#d13b4c]' : 'text-[#d13b4c]'}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-[#252f4a]">
                        {m.balanceAfter}
                      </td>
                      <td className="px-6 py-3.5 text-[#6b7177] max-w-xs truncate">
                        {m.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Stock Adjustment Modal */}
      <Modal
        isOpen={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        title="Manual Stock Adjustment"
        subtitle="Records an auditable movement reason in the inventory history"
      >
        <form onSubmit={handleAdjustStock} className="space-y-4">
          <Select
            label="Product *"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
          >
            {stockSummary.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.sku}) — Current: {s.remaining} units
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Adjustment Type *"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            >
              <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
              <option value="RETURN">Customer Return (+Stock)</option>
              <option value="PRODUCTION">Production Count Correction</option>
            </Select>

            <Input
              label="Quantity Change (+ or -) *"
              type="number"
              value={adjustQty}
              onChange={(e) => setAdjustQty(parseInt(e.target.value, 10) || 0)}
              required
            />
          </div>

          <Textarea
            label="Reason / Audit Note *"
            placeholder="e.g. Physical stock count discrepancy, damaged item write-off..."
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAdjustModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={modalLoading}>
              Apply Movement
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
