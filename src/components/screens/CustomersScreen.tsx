'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { useRegions } from '@/hooks/useRegions';
import { useApp } from '@/context/AppContext';
import { format } from 'date-fns';
import { RiAddCircleLine, RiMapPinLine, RiPhoneLine, RiSearchLine, RiUserLine } from '@remixicon/react';
import { Money } from '@/components/ui/Money';
import { HealthChip } from '@/components/ui/HealthChip';
import type { CustomerFacts } from '@/lib/customer-insights';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';
import { AskAi } from '@/components/growth/AskAi';
import { userCan } from '@/lib/can';
import { GRADE_RANK, scoreCustomer } from '@/lib/customer-score';
import { PageHeader } from '@/components/ui/PageHeader';

export function CustomersScreen() {
  const { t, currentUser } = useApp();
  // The assistant's own gate: a panel that opens onto a refusal is noise.
  const canAskAi = userCan(currentUser, 'ai.use');
  // Governorates of the selected country, not a hard-coded country list.
  const { regions, countryName } = useRegions();
  const regionNames = regions.map((r) => r.name);
  const [customers, setCustomers] = useState<any[]>([]);
  /** The whole book's figures, from the server — not a count of this page. */
  const [facts, setFacts] = useState<CustomerFacts | null>(null);
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
        setFacts(data.facts ?? null);
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

  /**
   * GRADED HERE, AND SORTED BY WHAT IS WORTH SEEING FIRST.
   *
   * `now` is taken once per render rather than inside the loop, so two
   * cards on the same screen cannot land on different sides of the dormancy
   * line — and the clock is read once, not once per row.
   */
  const now = new Date();
  const graded = customers
    .map((c) => ({ customer: c, score: scoreCustomer(c, now) }))
    .sort((a, b) => GRADE_RANK[a.score.grade] - GRADE_RANK[b.score.grade]);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader title={t.customers}
            description="سِجلّ العملاء: توحيدُ الأرقام، وكشفُ التكرار، وسجلُّ الطلبات — ومن يستلم ومن يرفض"
            actions={
              <><Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center space-x-1.5 bg-[var(--sys-destructive)] hover:bg-[var(--sys-destructive)]/85"
          >
            <RiAddCircleLine className="w-4 h-4" />
            <span>إضافة عميل</span>
          </Button></>
            }
          />

        {/* RiSearchLine */}
        <div className="relative max-w-md">
          <RiSearchLine className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sys-muted)]" />
          <input
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، المحافظة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 md:h-auto w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 md:py-2 text-xs bg-[var(--sys-card)] border border-[var(--sys-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sys-primary)]/30 focus:border-[var(--sys-primary)] shadow-raised"
          />
        </div>

        {/*
          WHAT THE BOOK SAYS, ABOVE WHAT THE PAGE SHOWS.

          Measured before this was written: 178 customers, 167 have
          ordered, 111 have received something, ONE has refused and ONE has
          ordered twice. A per-customer verdict needs three decided orders,
          so 178 chips reading «لا يكفي» would have been 178 pieces of
          noise. These five counts are real, and they are the ones a seller
          asks about. The figures come from the server over the WHOLE book,
          not over the hundred rows a search happened to return.
        */}
        {facts && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Fact label="عميل" value={facts.total} />
            <Fact label="طلبوا" value={facts.ordered} hint={`${facts.total - facts.ordered} لم يطلبوا بعد`} />
            <Fact label="كرّروا الطلب" value={facts.repeat} tone="success" />
            <Fact label="رفضوا طرداً" value={facts.refused} tone={facts.refused > 0 ? 'danger' : undefined} />
            <Fact
              label="نسبة الاستلام"
              value={facts.deliveryRate === null ? '—' : `${facts.deliveryRate}%`}
              hint={facts.deliveryRate === null ? 'لا طلبَ محسوماً بعد' : 'من الطلبات المحسومة'}
            />
          </div>
        )}

        {/*
          ONE LIST COMPONENT, LIKE EVERY OTHER SCREEN.

          This was a three-column grid of bespoke cards: a fourth way of
          drawing a list in a product that has one, with no phone layout of
          its own and nothing shared with the rest. `Rows` gives the same
          table on a desk, the same cards on a phone, and one place to fix
          any of it.
        */}
        <div className="overflow-hidden rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)]">
          <Rows
            rows={graded}
            keyOf={({ customer }) => customer.id}
            onRowClick={({ customer }) => setSelectedCustomer(customer)}
            alert={({ customer }) => (customer.cancelledOrders ?? 0) > 0}
            columns={[
              {
                key: 'name',
                label: 'العميل',
                primary: true,
                render: ({ customer: c, score }) => (
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--sys-heading)]">{c.fullName}</span>
                    {/*
                      The grade only where it means something. Below the
                      floor it says «لا يكفي», which is true of almost
                      every row here and worth saying once in the strip
                      above, not 178 times down the page.
                    */}
                    {score.grade !== 'new' && (
                      <span className="mt-0.5 block">
                        <HealthChip health={{ tone: score.tone, label: score.label, why: score.why }} />
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: 'phone',
                label: 'الهاتف',
                primary: true,
                render: ({ customer: c }) => (
                  <a
                    href={`tel:${c.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="tap-safe inline-flex items-center gap-1 font-mono text-[var(--sys-heading)] hover:text-[var(--sys-primary)]"
                  >
                    <RiPhoneLine className="h-4 w-4 text-[var(--sys-muted)]" />
                    <span dir="ltr">{c.rawPhone || c.phone}</span>
                  </a>
                ),
              },
              {
                key: 'city',
                label: 'المحافظة',
                render: ({ customer: c }) => (
                  <span className="inline-flex items-center gap-1 text-[var(--sys-muted-foreground)]">
                    <RiMapPinLine className="h-4 w-4 text-[var(--sys-muted)]" />
                    {c.city || '—'}
                  </span>
                ),
              },
              {
                key: 'orders',
                label: 'طلبات',
                align: 'end',
                render: ({ customer: c }) => (
                  <span className="tabular-nums">
                    <span className="font-semibold text-[var(--sys-heading)]">{c.totalOrders ?? 0}</span>
                    <span className="text-[var(--sys-muted)]"> · </span>
                    <span className="text-[var(--sys-success)]">{c.deliveredOrders ?? 0}</span>
                    {(c.cancelledOrders ?? 0) > 0 && (
                      <>
                        <span className="text-[var(--sys-muted)]"> · </span>
                        <span className="font-semibold text-[var(--sys-destructive)]">{c.cancelledOrders}</span>
                      </>
                    )}
                  </span>
                ),
              },
              {
                key: 'value',
                label: 'قيمة المشتريات',
                align: 'end',
                render: ({ customer: c }) => <Money value={c.totalPurchaseValue ?? 0} />,
              },
            ]}
            empty={
              <EmptyState
                title={search ? 'لا عميلَ يطابق بحثك' : 'لا عملاءَ بعد'}
                why={
                  search
                    ? 'جرّب رقماً أو جزءاً من اسم. الأرقامُ موحَّدة، فصيغةُ كتابتها لا تهمّ.'
                    : 'يُنشأ العميلُ من أوّل طلبٍ له، أو أضِفه بنفسك من الزرّ أعلاه.'
                }
              />
            }
          />
        </div>

        {/*
          AND THE ASSISTANT, READING THESE CUSTOMERS.

          The one assistant panel the intelligence screen uses, pointed at
          the customers source — not a second chat box. What it is given is
          the object above: counts, rates and governorates. No name, no
          phone, no address ever reaches a model.
        */}
        {canAskAi && <AskAi preselect={['CUSTOMERS']} />}
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
                  <Money value={selectedCustomer.totalPurchaseValue ?? 0} />
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
                    <Money value={ord.totalAmount} className="font-bold text-[var(--sys-heading)]" />
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

/**
 * One figure from the book, with the sentence that makes it readable.
 * Small on purpose: five of these are a strip, not a dashboard.
 */
function Fact({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'success' | 'danger';
}) {
  const colour =
    tone === 'success'
      ? 'text-[var(--sys-success)]'
      : tone === 'danger'
        ? 'text-[var(--sys-destructive)]'
        : 'text-[var(--sys-heading)]';
  return (
    <div className="rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] p-3">
      <p className="text-xs text-[var(--sys-muted-foreground)]">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${colour}`} dir="ltr">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-[var(--sys-muted)]">{hint}</p>}
    </div>
  );
}
