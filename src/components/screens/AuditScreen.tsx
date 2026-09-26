'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { format } from 'date-fns';
import { routeLabel } from '@/lib/route-registry';
import {  } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rows } from '@/components/ui/Rows';
import { EmptyState } from '@/components/ui/EmptyState';

export function AuditScreen() {
  const { t } = useApp();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader title={routeLabel('/control/audit')}
          description="Section 29 Complete immutable system audit trail: entity modifications, order mutations, batch creation & security actions"
        />

        {/* Audit Log Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
                            <Rows
                rows={logs}
                keyOf={(l) => l.id}
                columns={[
                  { key: 'c0', label: "الوقت", primary: true,
                    render: (l) => (format(new Date(l.createdAt), 'MMM d, yyyy HH:mm:ss')) },
                  { key: 'c1', label: "مَن", primary: true,
                    render: (l) => (
                  <>{l.user?.name || 'System Auto'}
                          <span className="block text-xs text-[var(--sys-muted)] font-mono">
                            {l.user?.role || 'SYSTEM'}
                          </span></>
                ) },
                  { key: 'c2', label: "الإجراء",
                    render: (l) => (
                  <><Badge variant="purple">{l.action}</Badge></>
                ) },
                  { key: 'c3', label: "الكيان",
                    render: (l) => (l.entity) },
                  { key: 'c4', label: "المعرّف",
                    render: (l) => (l.entityId) },
                  { key: 'c5', label: "التفاصيل",
                    render: (l) => (
                  <>{l.newData ? (
                            <span title={l.newData} className="bg-[var(--sys-surface)] px-2 py-0.5 rounded-lg">
                              {l.newData.slice(0, 60)}...
                            </span>
                          ) : (
                            '—'
                          )}</>
                ) },
                ]}
                empty={
                  <EmptyState
                    title="لا أحداث في السجلّ بعد"
                    why="السجلّ يكتب نفسه: كلُّ تعديلٍ على طلبٍ أو مالٍ أو صلاحية يترك أثراً هنا. فراغُه يعني أنّ لا شيء تغيّر منذ بدء التسجيل."
                  />
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
