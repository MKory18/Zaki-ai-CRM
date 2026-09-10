'use client';

import React, { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Settings2, Save, ShieldAlert } from 'lucide-react';
import { crmApi } from '@/lib/crm-client';
import { DEAL_STAGES, stageLabels, currencyOptions } from '@/lib/crm-format';

export default function CrmSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [dealPrefix, setDealPrefix] = useState('');
  const [stageOrder, setStageOrder] = useState<string[]>([...DEAL_STAGES]);

  useEffect(() => {
    crmApi('/api/settings')
      .then((d) => {
        const crm = d.company?.settings?.crm || {};
        setDefaultCurrency(crm.defaultCurrency || d.company?.currency || 'USD');
        setDealPrefix(crm.dealPrefix || '');
        if (Array.isArray(crm.pipelineStages) && crm.pipelineStages.length) {
          setStageOrder(crm.pipelineStages.filter((s: string) => (DEAL_STAGES as readonly string[]).includes(s)));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const moveStage = (idx: number, dir: -1 | 1) => {
    const next = [...stageOrder];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setStageOrder(next);
  };

  const handleSave = async () => {
    setSaving(true); setApiError(null); setSuccessMsg(null);
    try {
      // Read fresh settings so we don't clobber other keys
      const current = await crmApi('/api/settings');
      const settings = { ...(current.company?.settings || {}) };
      settings.crm = { defaultCurrency, pipelineStages: stageOrder, dealPrefix };
      await crmApi('/api/settings', { method: 'PATCH', body: JSON.stringify({ settings }) });
      setSuccessMsg('تم حفظ إعدادات CRM بنجاح');
    } catch (err: any) {
      setApiError(err.message);
      if (/صلاحية|permission|403/i.test(err.message || '')) setReadOnly(true);
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <AppLayout>
        <Card><CardContent className="py-12 text-center text-sm text-[#697586]">جارٍ التحميل...</CardContent></Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#121926]">إعدادات CRM</h1>
          <p className="text-xs text-[#697586] mt-1">تفضيلات الشركة لنظام إدارة العلاقات</p>
        </div>

        {successMsg && <div className="p-3 bg-[#e6f9ee] border border-[#c8f2d8] text-[#00c853] text-xs rounded-lg">{successMsg}</div>}
        {apiError && (
          <div className="p-3 bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs rounded-lg flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            {apiError}
          </div>
        )}

        <Card>
          <CardHeader title="التفضيلات العامة" subtitle="العملة الافتراضية وترتيب مراحل خط الصفقات" />
          <CardContent className="space-y-5">
            <Select label="العملة الافتراضية للصفقات والفواتير" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} disabled={readOnly}>
              {currencyOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>

            <Input label="بادئة أرقام الصفقات (اختياري)" placeholder="مثال: DEAL-" value={dealPrefix} onChange={(e) => setDealPrefix(e.target.value)} disabled={readOnly} />

            <div>
              <p className="text-xs font-medium text-[#121926] mb-2">ترتيب مراحل خط الصفقات</p>
              <div className="space-y-2">
                {stageOrder.map((s, idx) => (
                  <div key={s} className="flex items-center justify-between p-2.5 bg-[#f8fafc] rounded-lg">
                    <span className="text-sm font-medium text-[#121926]">{stageLabels[s]?.ar || s}</span>
                    <span className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" disabled={readOnly || idx === 0} onClick={() => moveStage(idx, -1)} title="أعلى">↑</Button>
                      <Button variant="ghost" size="sm" disabled={readOnly || idx === stageOrder.length - 1} onClick={() => moveStage(idx, 1)} title="أسفل">↓</Button>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {readOnly ? (
              <p className="text-xs text-[#697586] bg-[#f8fafc] p-3 rounded-lg">
                لا يمكن تعديل الإعدادات حالياً — تعديل تفضيلات الشركة متاح للمدراء فقط (صلاحية settings.manage).
              </p>
            ) : (
              <Button onClick={handleSave} loading={saving} className="flex items-center gap-1.5">
                <Save className="w-4 h-4" />
                <span>حفظ الإعدادات</span>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="ملاحظة" />
          <CardContent>
            <p className="text-xs text-[#697586] flex items-start gap-2">
              <Settings2 className="w-4 h-4 text-[#b8256e] shrink-0 mt-0.5" />
              تُحفظ هذه التفضيلات داخل إعدادات الشركة (Company.settings) وتؤثر على عرض CRM: العملة الافتراضية للصفقات والفواتير الجديدة، وترتيب أعمدة خط الصفقات.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
