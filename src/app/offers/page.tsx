'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { useApp } from '@/context/AppContext';
import { Tag, Plus, Check, Truck } from 'lucide-react';

export default function OffersPage() {
  const { t } = useApp();
  const [offers, setOffers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Form State
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [sellingPrice, setSellingPrice] = useState(20);
  const [discount, setDiscount] = useState(0);
  const [deliveryIncluded, setDeliveryIncluded] = useState(true);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [oRes, pRes] = await Promise.all([
        fetch('/api/offers'),
        fetch('/api/products'),
      ]);
      if (oRes.ok) {
        const oData = await oRes.json();
        setOffers(oData.offers || []);
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

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          name,
          quantity,
          sellingPrice,
          discount,
          deliveryIncluded,
          status: 'ACTIVE',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCreateModalOpen(false);
      setName('');
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
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.offers}</h1>
            <p className="text-xs text-[#697586] mt-1">
              Promotional bundles, volume tier discounts & free delivery configurations
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Promotional Offer</span>
          </Button>
        </div>

        {/* Offers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offers.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2.5 rtl:space-x-reverse">
                    <ProductThumb src={o.product?.image} alt={o.product?.name} size="md" />
                    <div>
                      <span className="text-[10px] font-bold text-[#fb323f] uppercase tracking-wider block">
                        {o.product?.name}
                      </span>
                      <h3 className="font-bold text-[#121926] text-sm mt-0.5">{o.name}</h3>
                    </div>
                  </div>
                  <Badge variant={o.status === 'ACTIVE' ? 'success' : 'default'}>
                    {o.status}
                  </Badge>
                </div>

                <div className="p-3 bg-[#f8fafc] rounded-xl border border-[#e3e8ef] flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[#9ca3af] block">Offer Price</span>
                    <span className="text-xl font-black text-[#121926]">
                      ${o.sellingPrice.toFixed(2)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-[#9ca3af] block">Pack Size</span>
                    <span className="text-sm font-bold text-[#fb323f]">
                      {o.quantity} {o.quantity === 1 ? 'Unit' : 'Units'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center space-x-1 text-[#fb323f] bg-[#feecee] px-2 py-0.5 rounded">
                    <Truck className="w-3.5 h-3.5" />
                    <span>{o.deliveryIncluded ? 'Free Delivery' : 'Standard Shipping'}</span>
                  </div>

                  {o.discount > 0 && (
                    <span className="text-[#fb323f] font-bold bg-[#feecee] px-2 py-0.5 rounded">
                      Save ${o.discount.toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-[#9ca3af] pt-2 border-t border-[#e3e8ef] flex justify-between">
                  <span>Unit Price Eqv:</span>
                  <strong className="text-[#364152]">
                    ${(o.sellingPrice / (o.quantity || 1)).toFixed(2)} / unit
                  </strong>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Create Offer Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Add Promotional Offer"
        subtitle="Offer bundle automatically fills price and quantity on moderator order form"
      >
        <form onSubmit={handleCreateOffer} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-[#feecee] border border-[#f5c6cb] text-[#fb323f] text-xs rounded-lg">
              {modalError}
            </div>
          )}

          <Select
            label="Product *"
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
            label="Offer Name *"
            placeholder="e.g. 3 Units Value Pack ($45) + Free Delivery"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Quantity in Offer *"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
              required
            />
            <Input
              label="Selling Price ($) *"
              type="number"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Customer Discount / Savings ($)"
              type="number"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
            />

            <Select
              label="Free Shipping Included?"
              value={deliveryIncluded ? 'yes' : 'no'}
              onChange={(e) => setDeliveryIncluded(e.target.value === 'yes')}
            >
              <option value="yes">Yes (Free Shipping)</option>
              <option value="no">No (Customer pays shipping)</option>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={modalLoading}>
              Save Offer
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
