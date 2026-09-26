'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { useRegions } from '@/hooks/useRegions';
import { useApp } from '@/context/AppContext';
import { Search, Plus, Phone, User, ShoppingBag, MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export function CustomersScreen() {
  const { t } = useApp();
  // Governorates of the selected country, not a hard-coded country list.
  const { regions, countryName } = useRegions();
  const regionNames = regions.map((r) => r.name);
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Selected customer for order history
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [address, setAddress] = useState('');
  // No default governorate. It was 'دمشق', in a system that runs Syrian,
  // Jordanian and Egyptian stores — so a customer added in Amman was born
  // in Damascus unless somebody noticed and changed it, and nobody notices
  // a field that is already filled in.
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalMsg, setModalMsg] = useState<string | null>(null);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalMsg(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone, altPhone, address, city, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.isExisting) {
        setModalMsg(`عميل موجود مسبقاً بهذا الرقم — تم ربط الطلب بنفس الملف.`);
      } else {
        setCreateModalOpen(false);
        setFullName('');
        setPhone('');
        setAltPhone('');
        setAddress('');
        setNotes('');
      }
      loadCustomers();
    } catch (err: any) {
      setModalMsg(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--sys-heading)]">{t.customers}</h1>
            <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">
              ملف العملاء مع توحيد أرقام الهاتݡ كشف التكرار وسجل الطلبات الكامل
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center space-x-1.5 bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/85"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عميل</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sys-muted)]" />
          <input
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، المحافظة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 text-xs bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/30 focus:border-[var(--sys-primary)] shadow-card"
          />
        </div>

        {/* Customer Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:border-[var(--sys-primary)]/40 transition-colors"
              onClick={() => setSelectedCustomer(c)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-[var(--sys-heading)] text-sm flex items-center space-x-1.5 rtl:space-x-reverse">
                      <User className="w-3.5 h-3.5 text-[var(--sys-destructive)]" />
                      <span>{c.fullName}</span>
                    </h3>
                    <p className="text-xs text-[var(--sys-muted-foreground)] flex items-center space-x-1 mt-1">
                      <MapPin className="w-3 h-3 text-[var(--sys-muted)]" />
                      <span>
                        {c.city}، {c.address}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[var(--sys-destructive)] bg-[var(--sys-destructive-soft)] px-2 py-0.5 rounded-md">
                    ${(c.totalPurchaseValue ?? 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-xs pt-2 border-t border-[var(--sys-border)]">
                  <a
                    href={`tel:${c.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center space-x-1 rtl:space-x-reverse font-mono font-bold text-[var(--sys-heading)] bg-[var(--sys-surface)] px-2 py-1 rounded-lg hover:bg-[var(--sys-border)]"
                  >
                    <Phone className="w-3 h-3 text-[var(--sys-destructive)]" />
                    <span dir="ltr">{c.rawPhone || c.phone}</span>
                  </a>
                  {c.altPhone && <span className="text-[var(--sys-muted)]">بديل: {c.altPhone}</span>}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--sys-border)] text-center text-caption">
                  <div className="bg-[var(--sys-surface)] p-1.5 rounded-lg">
                    <span className="text-[var(--sys-muted)] block">الكل</span>
                    <span className="font-bold text-[var(--sys-heading)]">{c.totalOrders}</span>
                  </div>
                  <div className="bg-[var(--sys-success-soft)] p-1.5 rounded-lg">
                    <span className="text-[var(--sys-success)] block">موصّل</span>
                    <span className="font-bold text-[var(--sys-success)]">{c.deliveredOrders}</span>
                  </div>
                  <div className="bg-[var(--sys-destructive-soft)] p-1.5 rounded-lg">
                    <span className="text-[var(--sys-destructive)] block">ملغي</span>
                    <span className="font-bold text-[var(--sys-destructive)]">{c.cancelledOrders}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Customer Details & History Modal */}
      {selectedCustomer && (
        <Modal
          isOpen={!!selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          title={selectedCustomer.fullName}
          subtitle={`ملف العميل • الرقم الموحد: ${selectedCustomer.phone}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <div className="p-4 bg-[var(--sys-surface)] rounded-lg grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[var(--sys-muted)]">رقم الهاتف:</span>
                <p className="font-bold font-mono text-[var(--sys-heading)] text-sm" dir="ltr">
                  {selectedCustomer.rawPhone || selectedCustomer.phone}
                </p>
              </div>
              <div>
                <span className="text-[var(--sys-muted)]">إجمالي المشتريات:</span>
                <p className="font-bold text-[var(--sys-destructive)] text-sm">
                  ${(selectedCustomer.totalPurchaseValue ?? 0).toFixed(2)}
                </p>
              </div>
              <div>
                <span className="text-[var(--sys-muted)]">العنوان:</span>
                <p className="font-medium text-[var(--sys-heading)]">{selectedCustomer.address}</p>
              </div>
              <div>
                <span className="text-[var(--sys-muted)]">المحافظة / الدولة:</span>
                <p className="font-medium text-[var(--sys-heading)]">
                  {selectedCustomer.city}، {selectedCustomer.country}
                </p>
              </div>
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--sys-foreground)] mt-2">
              سجل الطلبات ({selectedCustomer.orders?.length || 0})
            </h4>

            <div className="divide-y divide-[var(--sys-border)] max-h-60 overflow-y-auto">
              {selectedCustomer.orders?.map((ord: any) => (
                <div key={ord.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[var(--sys-destructive)]">{ord.orderNumber}</span>
                    <span className="text-[var(--sys-muted-foreground)] ml-2 rtl:ml-0 rtl:mr-2">{ord.product?.name}</span>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <span className="font-bold text-[var(--sys-heading)]">${ord.totalAmount.toFixed(2)}</span>
                    <OrderStatusBadge status={ord.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Add Customer Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="إضافة عميل جديد"
        subtitle="توحيد رقم الهاتف يمنع تسجيل العميل مرتين"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          {modalMsg && (
            <div className="p-3 bg-[var(--sys-surface)] border border-[var(--sys-primary-soft)] text-[var(--sys-primary)] text-xs rounded-lg">
              {modalMsg}
            </div>
          )}

          <Input
            label="الاسم الكامل *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="رقم الهاتف *"
              placeholder="مثال: 0936654998"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <Input
              label="رقم بديل"
              value={altPhone}
              onChange={(e) => setAltPhone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={`المحافظة${countryName ? ` — ${countryName}` : ''}`}
              value={regionNames.includes(city) ? city : 'أخرى'}
              onChange={(e) => setCity(e.target.value)}
              required
            >
              {regionNames.map((gov) => (
                <option key={gov} value={gov}>
                  {gov}
                </option>
              ))}
              <option value="أخرى">أخرى</option>
            </Select>
            {city === 'أخرى' && (
              <Input
                label="المحافظة / المدينة"
                value={city === 'أخرى' ? '' : city}
                onChange={(e) => setCity(e.target.value)}
              />
            )}
            <Input
              label="العنوان التفصيلي"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-2">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" loading={modalLoading}>
              حفظ العميل
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
