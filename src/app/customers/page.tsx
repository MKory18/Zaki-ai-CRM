'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { SYRIAN_GOVERNORATES } from '@/lib/syria';
import { useApp } from '@/context/AppContext';
import { Search, Plus, Phone, User, ShoppingBag, MapPin, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function CustomersPage() {
  const { t } = useApp();
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
  const [city, setCity] = useState('دمشق');
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
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">{t.customers}</h1>
            <p className="text-xs text-[#697586] mt-1">
              ملف العملاء مع توحيد أرقام الهاتݡ كشف التكرار وسجل الطلبات الكامل
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center space-x-1.5 bg-[#fb323f] hover:bg-[#fb323f]/85"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عميل</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
          <input
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، المحافظة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 text-xs bg-white border border-[#e3e8ef] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#b8256e]/30 focus:border-[#b8256e] shadow-xs"
          />
        </div>

        {/* Customer Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:border-[#b8256e]/40 transition-colors"
              onClick={() => setSelectedCustomer(c)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-[#121926] text-sm flex items-center space-x-1.5 rtl:space-x-reverse">
                      <User className="w-3.5 h-3.5 text-[#fb323f]" />
                      <span>{c.fullName}</span>
                    </h3>
                    <p className="text-xs text-[#697586] flex items-center space-x-1 mt-1">
                      <MapPin className="w-3 h-3 text-[#9ca3af]" />
                      <span>
                        {c.city}، {c.address}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#fb323f] bg-[#feecee] px-2 py-0.5 rounded-md">
                    ${(c.totalPurchaseValue ?? 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-xs pt-2 border-t border-[#e3e8ef]">
                  <a
                    href={`tel:${c.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center space-x-1 rtl:space-x-reverse font-mono font-bold text-[#121926] bg-[#f8fafc] px-2 py-1 rounded hover:bg-[#e8eaef]"
                  >
                    <Phone className="w-3 h-3 text-[#fb323f]" />
                    <span dir="ltr">{c.rawPhone || c.phone}</span>
                  </a>
                  {c.altPhone && <span className="text-[#9ca3af]">بديل: {c.altPhone}</span>}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#e3e8ef] text-center text-[11px]">
                  <div className="bg-[#f8fafc] p-1.5 rounded-lg">
                    <span className="text-[#9ca3af] block">الكل</span>
                    <span className="font-bold text-[#121926]">{c.totalOrders}</span>
                  </div>
                  <div className="bg-emerald-100 p-1.5 rounded-lg">
                    <span className="text-[#00c853] block">موصّل</span>
                    <span className="font-bold text-[#00c853]">{c.deliveredOrders}</span>
                  </div>
                  <div className="bg-[#feecee] p-1.5 rounded-lg">
                    <span className="text-[#fb323f] block">ملغي</span>
                    <span className="font-bold text-[#fb323f]">{c.cancelledOrders}</span>
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
            <div className="p-4 bg-[#f8fafc] rounded-xl grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#9ca3af]">رقم الهاتف:</span>
                <p className="font-bold font-mono text-[#121926] text-sm" dir="ltr">
                  {selectedCustomer.rawPhone || selectedCustomer.phone}
                </p>
              </div>
              <div>
                <span className="text-[#9ca3af]">إجمالي المشتريات:</span>
                <p className="font-bold text-[#fb323f] text-sm">
                  ${(selectedCustomer.totalPurchaseValue ?? 0).toFixed(2)}
                </p>
              </div>
              <div>
                <span className="text-[#9ca3af]">العنوان:</span>
                <p className="font-medium text-[#121926]">{selectedCustomer.address}</p>
              </div>
              <div>
                <span className="text-[#9ca3af]">المحافظة / الدولة:</span>
                <p className="font-medium text-[#121926]">
                  {selectedCustomer.city}، {selectedCustomer.country}
                </p>
              </div>
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wider text-[#364152] mt-2">
              سجل الطلبات ({selectedCustomer.orders?.length || 0})
            </h4>

            <div className="divide-y divide-[#e3e8ef] max-h-60 overflow-y-auto">
              {selectedCustomer.orders?.map((ord: any) => (
                <div key={ord.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[#fb323f]">{ord.orderNumber}</span>
                    <span className="text-[#697586] ml-2 rtl:ml-0 rtl:mr-2">{ord.product?.name}</span>
                  </div>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <span className="font-bold text-[#121926]">${ord.totalAmount.toFixed(2)}</span>
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
            <div className="p-3 bg-blue-50 border border-[#f2c9dd] text-[#b8256e] text-xs rounded-lg">
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
              label="المحافظة السورية"
              value={SYRIAN_GOVERNORATES.includes(city) || city === 'أخرى' ? city : 'أخرى'}
              onChange={(e) => setCity(e.target.value)}
              required
            >
              {SYRIAN_GOVERNORATES.map((gov) => (
                <option key={gov} value={gov}>
                  {gov}
                </option>
              ))}
              <option value="أخرى">أخرى / خارج سوريا</option>
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
            <Button type="submit" loading={modalLoading} className="bg-[#fb323f] hover:bg-[#fb323f]/85">
              حفظ العميل
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
