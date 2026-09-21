'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bike, Package, Wallet, Loader2, ChevronLeft, AlertTriangle } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { amount, arDateShort, type Currency } from '@/lib/format';

/**
 * /finance/agents — what each agent is holding.
 *
 * A shipping company sends a statement and we match it. An agent sends
 * nothing: he takes parcels, knocks on doors, collects cash, and comes back.
 * Until now nobody could say how much of either was in his hands.
 *
 * Everything here is derived from the orders he is carrying, so there is no
 * custody figure to correct and none to drift. And nothing here moves money:
 * receiving from an agent is a settlement, and settlements go through their
 * own chain.
 */

interface Totals {
  inHandCount: number;
  inHandValue: number;
  collected: number;
  fees: number;
  balance: number;
}

interface CustodyOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  regionName: string | null;
  shippingStatus: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  collected: number;
  fee: number;
}

interface Detail {
  agent: { id: string; name: string; code: string };
  currencyCode: string;
  inHand: CustodyOrder[];
  owing: CustodyOrder[];
  totals: Totals;
}

const STATUS_AR: Record<string, string> = {
  SHIPPED: 'مشحون',
  OUT_FOR_DELIVERY: 'خرج للتوصيل',
  FAILED_DELIVERY: 'فشل التوصيل',
  RETURN_REQUESTED: 'طُلب إرجاعه',
  DELIVERED: 'سُلّم',
  PARTIALLY_DELIVERED: 'سُلّم جزئياً',
};

export function AgentCustodyScreen() {
  const [agents, setAgents] = useState<{ agent: Detail['agent']; totals: Totals }[] | null>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ agents: typeof agents; currencyCode: string }>('/api/finance/agents');
      setAgents(res.agents ?? []);
      setCurrency({ code: res.currencyCode, minorUnit: res.currencyCode === 'JOD' ? 3 : 2 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر التحميل');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openAgent(id: string) {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await apiJson<{ custody: Detail }>(`/api/finance/agents?id=${encodeURIComponent(id)}`);
      setOpen(res.custody);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر فتح العهدة');
    } finally {
      setLoadingDetail(false);
    }
  }

  if (!agents) {
    return (
      <div className="flex items-center justify-center gap-2 text-[#697586] text-sm py-16">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
      </div>
    );
  }

  const money = (n: number) => amount(n, currency);

  if (open) {
    return (
      <div className="max-w-4xl space-y-4">
        <button
          onClick={() => setOpen(null)}
          className="text-xs text-[#697586] hover:text-[#b8256e] inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4 rotate-180" />
          كل المندوبين
        </button>

        <div>
          <h1 className="text-2xl font-bold text-[#121926] flex items-center gap-2">
            <Bike className="w-6 h-6 text-[#b8256e]" />
            عهدة {open.agent.name}
          </h1>
          <p className="text-xs text-[#697586] mt-1" dir="ltr">{open.agent.code}</p>
        </div>

        <Summary totals={open.totals} money={money} />

        <Section
          title="ما زال بيده"
          subtitle="طلبات خرجت معه ولم تُغلق بعد — بضاعة، لا مال"
          icon={Package}
          orders={open.inHand}
          money={money}
          showFee={false}
        />

        <Section
          title="حصّله ولم يسلّمه"
          subtitle="سُلّمت وقُبض ثمنها، ولم تصل إلينا بعد"
          icon={Wallet}
          orders={open.owing}
          money={money}
          showFee
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#121926] flex items-center gap-2">
          <Bike className="w-6 h-6 text-[#b8256e]" />
          عهدة المندوبين
        </h1>
        <p className="text-xs text-[#697586] mt-1">
          ما بيد كل مندوب الآن: بضاعة لم تُغلق، ومال حصّله ولم يسلّمه.
        </p>
      </div>

      {error && (
        <p className="text-sm text-[#fb323f] bg-[#feecee] border border-[#fecdd1] rounded-[8px] p-3">{error}</p>
      )}

      {agents.length === 0 ? (
        <p className="text-sm text-[#697586] bg-white border border-[#e3e8ef] rounded-[8px] p-6 text-center">
          لا مندوبين بعد — يُضافون من الإعدادات ← شركات الشحن بنوع «مندوب».
        </p>
      ) : (
        <ul className="bg-white border border-[#e3e8ef] rounded-[8px] divide-y divide-[#e3e8ef]">
          {agents.map(({ agent, totals }) => (
            <li key={agent.id}>
              <button
                onClick={() => openAgent(agent.id)}
                disabled={loadingDetail}
                className="w-full text-start p-4 hover:bg-[#f8fafc] transition-colors disabled:opacity-60"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="font-bold text-[#121926] text-sm inline-flex items-center gap-1.5 min-w-[130px]">
                    <Bike className="w-4 h-4 text-[#b8256e]" />
                    {agent.name}
                  </span>

                  <span className="text-[11px] text-[#697586]">
                    بيده:{' '}
                    <span className="font-semibold text-[#121926] tabular-nums">{totals.inHandCount}</span> طلب
                    <span className="text-[#9aa4b2]"> ({money(totals.inHandValue)})</span>
                  </span>

                  <span className="text-[11px] text-[#697586]">
                    حصّل: <span className="font-semibold text-[#121926] tabular-nums">{money(totals.collected)}</span>
                  </span>

                  <span className="text-[11px] text-[#697586]">
                    له: <span className="font-semibold text-[#121926] tabular-nums">{money(totals.fees)}</span>
                  </span>

                  <Balance value={totals.balance} money={money} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-[#9aa4b2]">
        الأرقام محسوبة من الطلبات نفسها لحظة فتح الشاشة — لا رصيد مخزَّن يمكن أن يختلف عن الواقع.
      </p>
    </div>
  );
}

function Balance({ value, money }: { value: number; money: (n: number) => string }) {
  const owesUs = value > 0;
  const weOwe = value < 0;
  return (
    <span
      className={`ms-auto text-xs font-bold tabular-nums px-2.5 py-1 rounded-[6px] border ${
        owesUs
          ? 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]'
          : weOwe
            ? 'bg-[#eef4ff] text-[#2563eb] border-[#c7dbff]'
            : 'bg-[#f8fafc] text-[#697586] border-[#e3e8ef]'
      }`}
    >
      {owesUs ? 'عليه ' : weOwe ? 'له ' : 'متوازن '}
      {money(Math.abs(value))}
    </span>
  );
}

function Summary({ totals, money }: { totals: Totals; money: (n: number) => string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Tile label="طلبات بيده" value={String(totals.inHandCount)} hint={money(totals.inHandValue)} />
      <Tile label="حصّله" value={money(totals.collected)} />
      <Tile label="أجوره علينا" value={money(totals.fees)} />
      <div
        className={`rounded-xl border p-3 ${
          totals.balance > 0
            ? 'bg-[#fff7ed] border-[#fed7aa]'
            : totals.balance < 0
              ? 'bg-[#eef4ff] border-[#c7dbff]'
              : 'bg-[#f8fafc] border-[#e3e8ef]'
        }`}
      >
        <p className="text-[10px] text-[#697586]">
          {totals.balance > 0 ? 'صافي عليه' : totals.balance < 0 ? 'صافي له' : 'متوازن'}
        </p>
        <p className="text-sm font-black text-[#121926] tabular-nums mt-0.5" dir="ltr">
          {money(Math.abs(totals.balance))}
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#e3e8ef] bg-white p-3">
      <p className="text-[10px] text-[#697586]">{label}</p>
      <p className="text-sm font-black text-[#121926] tabular-nums mt-0.5" dir="ltr">{value}</p>
      {hint && <p className="text-[10px] text-[#9aa4b2] tabular-nums" dir="ltr">{hint}</p>}
    </div>
  );
}

function Section({
  title, subtitle, icon: Icon, orders, money, showFee,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  orders: CustodyOrder[];
  money: (n: number) => string;
  showFee: boolean;
}) {
  return (
    <div className="bg-white border border-[#e3e8ef] rounded-[8px]">
      <div className="px-4 py-3 border-b border-[#e3e8ef]">
        <h4 className="text-xs font-black text-[#121926] flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#b8256e]" />
          {title}
          <span className="text-[10px] font-medium text-[#9aa4b2] tabular-nums">{orders.length}</span>
        </h4>
        <p className="text-[11px] text-[#9aa4b2] mt-0.5">{subtitle}</p>
      </div>

      {orders.length === 0 ? (
        <p className="px-4 py-5 text-[11px] text-[#9aa4b2] text-center">لا شيء هنا.</p>
      ) : (
        <ul className="divide-y divide-[#e3e8ef]">
          {orders.map((o) => {
            const stuck = o.shippingStatus === 'FAILED_DELIVERY' || o.shippingStatus === 'RETURN_REQUESTED';
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[11px]">
                <span className="font-semibold text-[#121926]" dir="ltr">{o.orderNumber}</span>
                {stuck && (
                  <span className="inline-flex items-center gap-1 text-[#c2410c]">
                    <AlertTriangle className="w-3 h-3" />
                    {STATUS_AR[o.shippingStatus]}
                  </span>
                )}
                <span className="text-[#697586] truncate max-w-[160px]">{o.customerName}</span>
                {o.regionName && <span className="text-[#9aa4b2]">{o.regionName}</span>}
                <span className="text-[#9aa4b2]">
                  {arDateShort(o.deliveredAt ?? o.shippedAt)}
                </span>
                {showFee && (
                  <span className="text-[#9aa4b2] tabular-nums" dir="ltr">
                    أجرة {money(o.fee)}
                  </span>
                )}
                <span className="ms-auto font-bold text-[#121926] tabular-nums" dir="ltr">
                  {money(o.collected)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
