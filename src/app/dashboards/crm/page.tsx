'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent, KpiCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Handshake, Users, UserPlus, DollarSign, ListChecks, Plus, Trophy, CheckCircle2, Clock,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { crmApi } from '@/lib/crm-client';
import { formatCurrency, stageLabels, priorityLabels, activityTypeLabels } from '@/lib/crm-format';

export default function CrmDashboardPage() {
  const { locale, t } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const ar = locale === 'ar';

  useEffect(() => {
    crmApi('/api/crm/dashboard')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const kpis = data?.kpis || {};
  const quickActions = [
    { href: '/dashboards/crm/tasks', label: 'مهمة جديدة', icon: ListChecks },
    { href: '/dashboards/crm/contacts', label: 'جهة اتصال', icon: Users },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">لوحة CRM</h1>
            <p className="text-xs text-[#697586] mt-1">
              نظرة عامة على جهات الاتصال، الصفقات، المهام والإيرادات
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((a) => (
              <Link key={a.href} href={a.href}>
                <Button size="sm" variant="outline" className="flex items-center gap-1.5 rtl:space-x-reverse">
                  <a.icon className="w-3.5 h-3.5 text-[#b8256e]" />
                  <span>{a.label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>

        {loading ? (
          <Card><CardContent className="py-12 text-center text-sm text-[#697586]">جارٍ التحميل...</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <KpiCard title="قيمة خط الصفقات" value={formatCurrency(kpis.pipelineValue)} icon={DollarSign} color="blue" />
              <KpiCard title="صفقات مفتوحة" value={kpis.openDeals ?? 0} icon={Handshake} color="purple" />
              <KpiCard title="إيرادات محققة" value={formatCurrency(kpis.wonValue)} icon={Trophy} color="emerald" />
              <KpiCard title="عملاء محتملون مفتوحون" value={kpis.openLeads ?? 0} icon={UserPlus} color="amber" />
              <KpiCard title="مهام اليوم" value={kpis.tasksDueToday ?? 0} subtitle={`متأخرة: ${kpis.overdueTasks ?? 0}`} icon={ListChecks} color="rose" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="الصفقات حسب المرحلة" subtitle="القيمة الإجمالية لكل مرحلة" />
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(data?.dealsByStage || []).map((d: any) => ({
                      name: stageLabels[d.stage]?.ar || d.stage,
                      value: d.value || 0,
                      count: d.count || 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ef" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#364152' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#364152' }} />
                      <Tooltip formatter={(v: any, n: any) => (n === 'value' ? [formatCurrency(v), 'القيمة'] : [v, 'العدد'])} />
                      <Bar dataKey="value" fill="#b8256e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader title="الإيرادات الشهرية" subtitle="الفوز vs الفواتير" />
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data?.revenueByMonth || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e3e8ef" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#364152' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#364152' }} />
                      <Tooltip formatter={(v: any) => formatCurrency(v)} />
                      <Line type="monotone" dataKey="won" name="صفقات مفقوحة" stroke="#00c853" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="invoiced" name="مفوتر" stroke="#b8256e" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card>
                <CardHeader title="أفضل الصفقات المفتوحة" />
                <CardContent className="p-2">
                  <div className="divide-y divide-[#e3e8ef]">
                    {(data?.topOpenDeals || []).slice(0, 6).map((d: any) => (
                      <div key={d.id} className="py-2.5 px-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#121926] truncate">{d.title}</p>
                          <p className="text-[11px] text-[#697586]">
                            {d.crmContact ? d.crmContact.firstName + ' ' + d.crmContact.lastName : '—'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-[#121926]">{formatCurrency(d.value, d.currency)}</p>
                          <Badge variant={stageLabels[d.stage]?.variant || 'default'}>
                            {stageLabels[d.stage]?.ar || d.stage}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {!data?.topOpenDeals?.length && (
                      <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد صفقات مفتوحة</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader title="المهام القادمة" />
                <CardContent className="p-2">
                  <div className="divide-y divide-[#e3e8ef]">
                    {(data?.upcomingTasks || []).slice(0, 6).map((task: any) => (
                      <div key={task.id} className="py-2.5 px-2 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#b8256e] shrink-0" />
                          <p className="text-sm font-medium text-[#121926] truncate">{task.title}</p>
                        </div>
                        <Badge variant={priorityLabels[task.priority]?.variant || 'default'}>
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString('ar') : '—'}
                        </Badge>
                      </div>
                    ))}
                    {!data?.upcomingTasks?.length && (
                      <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد مهام قادمة</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader title="الأنشطة الأخيرة" />
                <CardContent className="p-4 max-h-80 overflow-y-auto">
                  <div className="space-y-3 border-r border-[#e3e8ef] pr-4">
                    {(data?.recentActivities || []).slice(0, 8).map((a: any) => (
                      <div key={a.id} className="relative">
                        <span className="absolute -right-[22px] top-1 w-2 h-2 rounded-full bg-[#b8256e]" />
                        <div className="flex items-center gap-2">
                          <Badge variant={activityTypeLabels[a.type]?.variant || 'default'}>
                            {activityTypeLabels[a.type]?.ar || a.type}
                          </Badge>
                          <span className="text-[11px] text-[#9ca3af] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {a.occurredAt ? new Date(a.occurredAt).toLocaleString('ar') : '—'}
                          </span>
                        </div>
                        <p className="text-xs text-[#121926] font-medium mt-1">{a.subject}</p>
                        {a.description && <p className="text-[11px] text-[#697586] line-clamp-2">{a.description}</p>}
                      </div>
                    ))}
                    {!data?.recentActivities?.length && (
                      <p className="py-6 text-center text-xs text-[#9ca3af]">لا توجد أنشطة بعد</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
