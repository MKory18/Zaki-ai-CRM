'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent, KpiCard } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { DollarSign, Handshake, Trophy, Target, UserPlus, XCircle } from 'lucide-react';
import { crmApi } from '@/lib/crm-client';
import { formatCurrency, stageLabels, leadStatusLabels } from '@/lib/crm-format';

const FUNNEL_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'];

export default function ReportsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    crmApi('/api/crm/dashboard')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const k = data?.kpis || {};
  const winRate = k.wonCount + k.lostCount > 0 ? Math.round((k.wonCount / (k.wonCount + k.lostCount)) * 100) : 0;

  // Funnel built from dealsByStage order for open pipeline + leads via status counts if provided
  const funnelData = FUNNEL_STAGES.map((s) => ({
    name: leadStatusLabels[s]?.ar || s,
    count: data?.leadsByStatus?.find((x: any) => x.status === s)?.count ?? 0,
  }));

  const stageData = (data?.dealsByStage || []).map((d: any) => ({
    name: stageLabels[d.stage]?.ar || d.stage,
    value: d.value || 0,
    count: d.count || 0,
  }));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#121926]">تقارير CRM</h1>
          <p className="text-xs text-[#697586] mt-1">ملخص الأداء لجميع الفترات (بيانات تراكمية)</p>
        </div>

        {loading ? (
          <Card><CardContent className="py-12 text-center text-sm text-[#697586]">جارٍ التحميل...</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <KpiCard title="قيمة خط الصفقات" value={formatCurrency(k.pipelineValue)} icon={DollarSign} color="blue" />
              <KpiCard title="إيرادات محققة" value={formatCurrency(k.wonValue)} subtitle={`${k.wonCount ?? 0} صفقة مفقوحة`} icon={Trophy} color="emerald" />
              <KpiCard title="معدل الفوز" value={`${winRate}%`} subtitle={`${k.wonCount ?? 0} فوز • ${k.lostCount ?? 0} خسارة`} icon={Target} color="purple" />
              <KpiCard title="عملاء محتملون مفتوحون" value={k.openLeads ?? 0} icon={UserPlus} color="amber" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="الصفقات حسب المرحلة" subtitle="القيمة الإجمالية" />
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stageData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ef" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#364152' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#364152' }} />
                      <Tooltip formatter={(v: any) => [formatCurrency(v), 'القيمة']} />
                      <Bar dataKey="value" fill="#b8256e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader title="قمع التحويل" subtitle="العملاء المحتملون حسب الحالة" />
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ef" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#364152' }} />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: '#364152' }} />
                      <Tooltip />
                      <Bar dataKey="count" name="العدد" fill="#8c72f7" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader title="الإيرادات الشهرية" subtitle="صفقات مفقوحة مقابل مفوتر" />
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.revenueByMonth || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ef" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#364152' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#364152' }} />
                    <Tooltip formatter={(v: any) => formatCurrency(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="won" name="صفقات مفقوحة" stroke="#00c853" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="invoiced" name="مفوتر" stroke="#b8256e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="أفضل الصفقات المفتوحة" />
              <CardContent className="p-4">
                <div className="overflow-x-auto rounded-lg border border-[#e3e8ef]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#f8fafc]">
                      <tr>
                        {['العنوان', 'القيمة', 'المرحلة', 'الاحتمالية', 'جهة الاتصال'].map((h) => (
                          <th key={h} className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#697586]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e8ef] bg-white">
                      {(data?.topOpenDeals || []).map((d: any) => (
                        <tr key={d.id}>
                          <td className="px-4 py-3 font-semibold text-[#121926]">{d.title}</td>
                          <td className="px-4 py-3 text-xs font-bold text-[#121926]">{formatCurrency(d.value, d.currency)}</td>
                          <td className="px-4 py-3"><Badge variant={stageLabels[d.stage]?.variant}>{stageLabels[d.stage]?.ar || d.stage}</Badge></td>
                          <td className="px-4 py-3 text-xs text-[#697586]">{d.probability ?? 0}%</td>
                          <td className="px-4 py-3 text-xs text-[#364152]">{d.crmContact ? `${d.crmContact.firstName} ${d.crmContact.lastName}` : '—'}</td>
                        </tr>
                      ))}
                      {!data?.topOpenDeals?.length && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-[#9ca3af]">لا توجد صفقات مفتوحة</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
