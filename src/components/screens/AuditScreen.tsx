'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { format } from 'date-fns';
import { routeLabel } from '@/lib/route-registry';
import { RiUserLine } from '@remixicon/react';
import { PageHeader } from '@/components/ui/PageHeader';

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
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[var(--sys-surface)] border-b border-[var(--sys-border)] text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-wider">
                  <tr>
                    {/* The columns were English on an Arabic-only screen,
                        and one of them was «RiUserLine» — an icon name a
                        rename swept into the heading, printed to whoever
                        opens the audit log. */}
                    <th className="px-6 py-3.5">الوقت</th>
                    <th className="px-6 py-3.5">مَن</th>
                    <th className="px-6 py-3.5">الإجراء</th>
                    <th className="px-6 py-3.5">الكيان</th>
                    <th className="px-6 py-3.5">المعرّف</th>
                    <th className="px-6 py-3.5">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sys-border)] font-mono">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[var(--sys-muted)] font-sans">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    logs.map((l) => (
                      <tr key={l.id} className="hover:bg-[var(--sys-surface)] transition-colors">
                        <td className="px-6 py-3.5 text-[var(--sys-muted-foreground)]">
                          {format(new Date(l.createdAt), 'MMM d, yyyy HH:mm:ss')}
                        </td>

                        <td className="px-6 py-3.5 font-sans font-medium text-[var(--sys-heading)]">
                          {l.user?.name || 'System Auto'}
                          <span className="block text-xs text-[var(--sys-muted)] font-mono">
                            {l.user?.role || 'SYSTEM'}
                          </span>
                        </td>

                        <td className="px-6 py-3.5 font-sans">
                          <Badge variant="purple">{l.action}</Badge>
                        </td>

                        <td className="px-6 py-3.5 font-sans font-semibold text-[var(--sys-heading)]">
                          {l.entity}
                        </td>

                        <td className="px-6 py-3.5 text-[var(--sys-muted)] max-w-[120px] truncate">
                          {l.entityId}
                        </td>

                        <td className="px-6 py-3.5 text-[var(--sys-foreground)] font-sans max-w-xs truncate text-xs">
                          {l.newData ? (
                            <span title={l.newData} className="bg-[var(--sys-surface)] px-2 py-0.5 rounded-lg">
                              {l.newData.slice(0, 60)}...
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
