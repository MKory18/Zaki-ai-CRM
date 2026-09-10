'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { Factory, Plus, Calculator, Calendar, Boxes } from 'lucide-react';
import { format } from 'date-fns';

export default function ProductionPage() {
  const { t } = useApp();
  const [batches, setBatches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [productId, setProductId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantityProduced, setQuantityProduced] = useState(1000);
  const [manufacturingCost, setManufacturingCost] = useState(2500);
  const [packagingCost, setPackagingCost] = useState(800);
  const [rawMaterialCost, setRawMaterialCost] = useState(700);
  const [otherCosts, setOtherCosts] = useState(0);
  const [notes, setNotes] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Dynamic live calculation
  const totalProductionCost =
    (manufacturingCost || 0) +
    (packagingCost || 0) +
    (rawMaterialCost || 0) +
    (otherCosts || 0);

  const costPerUnit =
    quantityProduced > 0 ? (totalProductionCost / quantityProduced).toFixed(2) : '0.00';

  const loadData = async () => {
    setLoading(true);
    try {
      const [bRes, pRes] = await Promise.all([
        fetch('/api/production'),
        fetch('/api/products'),
      ]);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBatches(bData.batches || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setProducts(pData.products || []);
        if (pData.products?.length > 0 && !productId) {
          setProductId(pData.products[0].id);
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

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          batchNumber,
          quantityProduced,
          manufacturingCost,
          packagingCost,
          rawMaterialCost,
          otherCosts,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCreateModalOpen(false);
      setBatchNumber('');
      setNotes('');
      loadData();
    } catch (err: any) {
      setModalError(err.message);
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
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.production}</h1>
            <p className="text-xs text-[#697586] mt-1">
              Section 5 Manufacturing & Cost per unit calculation engine with inventory movement linkage
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => {
              setBatchNumber(`BATCH-${new Date().getFullYear()}-${String(batches.length + 1).padStart(3, '0')}`);
              setCreateModalOpen(true);
            }}
            className="flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Production Batch</span>
          </Button>
        </div>

        {/* Batch List Table */}
        <Card>
          <CardHeader
            title="Manufacturing Batches & Cost Accounting"
            subtitle="Tracks unit cost, packaging overhead, and sold vs remaining batch inventory"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Batch Number</th>
                    <th className="px-6 py-3.5">Product</th>
                    <th className="px-6 py-3.5">Produced</th>
                    <th className="px-6 py-3.5">Sold</th>
                    <th className="px-6 py-3.5">Remaining</th>
                    <th className="px-6 py-3.5">Total Cost</th>
                    <th className="px-6 py-3.5">Cost / Unit</th>
                    <th className="px-6 py-3.5">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-6 py-3.5 font-bold font-mono text-[#fb323f]">
                        {b.batchNumber}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-semibold text-[#121926] block">{b.product?.name}</span>
                        <span className="text-[10px] text-[#9ca3af] font-mono">{b.product?.sku}</span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#121926]">
                        {b.quantityProduced} units
                      </td>
                      <td className="px-6 py-3.5 text-[#fb323f] font-medium">
                        {b.quantitySold} units
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-[#fb323f] bg-[#feecee] px-2 py-0.5 rounded-full">
                          {b.quantityRemaining} units
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-bold text-[#121926]">
                        ${b.totalProductionCost.toFixed(2)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="font-black text-[#fb323f] bg-[#feecee] px-2.5 py-1 rounded-md text-xs">
                          ${b.costPerUnit.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-[#9ca3af]">
                        {format(new Date(b.productionDate), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Production Batch Modal with Section 5 Live Formula Calculator */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="New Manufacturing Batch"
        subtitle="Calculates Cost Per Unit automatically based on manufacturing, packaging, and raw material expenses"
        maxWidth="xl"
      >
        <form onSubmit={handleCreateBatch} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-lg">
              {modalError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Select Product *"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>

            <Input
              label="Batch Number *"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
              required
            />
          </div>

          <Input
            label="Quantity Produced (Units) *"
            type="number"
            min="1"
            value={quantityProduced}
            onChange={(e) => setQuantityProduced(parseInt(e.target.value, 10) || 0)}
            required
          />

          {/* Cost Items Grid */}
          <div className="border border-[#e3e8ef] rounded-xl p-4 bg-[#f8fafc]/60 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152]">
              Direct Cost Breakdown ($)
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Manufacturing Cost ($)"
                type="number"
                step="0.01"
                value={manufacturingCost}
                onChange={(e) => setManufacturingCost(parseFloat(e.target.value) || 0)}
              />
              <Input
                label="Packaging Cost ($)"
                type="number"
                step="0.01"
                value={packagingCost}
                onChange={(e) => setPackagingCost(parseFloat(e.target.value) || 0)}
              />
              <Input
                label="Raw Material Cost ($)"
                type="number"
                step="0.01"
                value={rawMaterialCost}
                onChange={(e) => setRawMaterialCost(parseFloat(e.target.value) || 0)}
              />
              <Input
                label="Other / QC Costs ($)"
                type="number"
                step="0.01"
                value={otherCosts}
                onChange={(e) => setOtherCosts(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Section 5 Live Real-time Calculator Box */}
          <div className="p-4 bg-[#feecee] border border-[#f5c6cb] rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-[#fb323f]" />
              <div>
                <p className="font-bold text-[#121926]">Total Production Cost: ${totalProductionCost.toFixed(2)}</p>
                <p className="text-[#697586]">
                  Formula: Mfg (${manufacturingCost}) + Packaging (${packagingCost}) + Raw (${rawMaterialCost})
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[#697586] block">Calculated Cost Per Unit:</span>
              <span className="text-xl font-black text-[#fb323f] block">
                ${costPerUnit}
              </span>
            </div>
          </div>

          <Textarea
            label="Batch Notes & Quality Control"
            placeholder="e.g. Amber glass vials, passed lab leak audit..."
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={modalLoading}>
              Save Batch & Add to Stock
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
