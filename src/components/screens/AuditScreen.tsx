'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { History, Shield, User, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { findRoute } from '@/lib/route-registry';

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--sys-heading)] flex items-center space-x-2">
            <History className="w-6 h-6 text-[var(--sys-foreground)]" />
            <span>{findRoute('/control/audit')?.label}</span>
          </h1>
          <p className="text-xs text-[var(--sys-muted-foreground)] mt-1">
            Section 29 Complete immutable system audit trail: entity modifications, order mutations, batch creation & security actions
          </p>
        </div>

        {/* Audit Log Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className="bg-[var(--sys-surface)] border-b border-[var(--sys-border)] text-[var(--sys-muted-foreground)] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Timestamp</th>
                    <th className="px-6 py-3.5">User</th>
                    <th className="px-6 py-3.5">Action</th>
                    <th className="px-6 py-3.5">Entity</th>
                    <th className="px-6 py-3.5">Entity ID</th>
                    <th className="px-6 py-3.5">Mutation Details</th>
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
                          <span className="block text-[10px] text-[var(--sys-muted)] font-mono">
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

                        <td className="px-6 py-3.5 text-[var(--sys-foreground)] font-sans max-w-xs truncate text-[11px]">
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
