'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { crmApi } from '@/lib/crm-client';
import { useApp } from '@/context/AppContext';
import {
  Send, Settings, Plus, RefreshCw, CheckCircle2, XCircle,
  AlertCircle, Trash2, Power, MessageSquare, ShoppingBag, RotateCcw, FlaskConical,
} from 'lucide-react';

interface TelegramSource {
  id: string;
  chatId: string;
  chatType: string;
  chatTitle: string | null;
  topicId: number | null;
  topicName: string | null;
  isActive: boolean;
  ordersCount: number;
  lastMessageAt: string | null;
}

interface TelegramMsg {
  id: string;
  chatId: string;
  messageId: string;
  threadId: number | null;
  threadName: string | null;
  senderName: string | null;
  text: string | null;
  processingStatus: string;
  reviewReason: string | null;
  createdAt: string;
  source: { chatTitle: string | null; topicName: string | null; chatId: string; topicId: number | null } | null;
  order: { id: string; orderNumber: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ظ‚ظٹط¯ ط§ظ„ظ…ط¹ط§ظ„ط¬ط©',
  PROCESSED: 'طھظ… ط¥ظ†ط´ط§ط، ط·ظ„ط¨',
  IGNORED: 'ظ…طھط¬ط§ظ‡ظ„ط©',
  NEEDS_REVIEW: 'طھط­طھط§ط¬ ظ…ط±ط§ط¬ط¹ط©',
  FAILED: 'ظپط´ظ„طھ',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-[#fff7e6] text-[#b8860b]',
  PROCESSED: 'bg-[#e6f9ee] text-[#00a651]',
  IGNORED: 'bg-[#f1f5f9] text-[#697586]',
  NEEDS_REVIEW: 'bg-[#fff1f2] text-[#e11d48]',
  FAILED: 'bg-[#fef2f2] text-[#dc2626]',
};

const REVIEW_REASONS: Record<string, string> = {
  PRODUCT_NOT_FOUND: 'ط§ظ„ظ…ظ†طھط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯',
  AMBIGUOUS_PRODUCT: 'ط£ظƒط«ط± ظ…ظ† ظ…ظ†طھط¬ ظ…ط­طھظ…ظ„',
  INVALID_PHONE: 'ط±ظ‚ظ… ظ‡ط§طھظپ ط؛ظٹط± طµط§ظ„ط­',
  MISSING_CUSTOMER_NAME: 'ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„ ظ†ط§ظ‚طµ',
  MISSING_ADDRESS: 'ط§ظ„ط¹ظ†ظˆط§ظ† ظ†ط§ظ‚طµ',
  MISSING_PRODUCT: 'ط§ظ„ظ…ظ†طھط¬ ظ†ط§ظ‚طµ',
  INVALID_QUANTITY: 'ظƒظ…ظٹط© ط؛ظٹط± طµط§ظ„ط­ط©',
  NO_SYSTEM_ACTOR: 'ظ„ط§ ظٹظˆط¬ط¯ ظ…ط³طھط®ط¯ظ… ظ†ط¸ط§ظ…',
  CREATION_FAILED: 'ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ط·ظ„ط¨',
};

const REVIEW_REASONS_EMPTY = ['MISSING_CUSTOMER_NAME', 'MISSING_ADDRESS', 'MISSING_PRODUCT', 'INVALID_PHONE', 'INVALID_QUANTITY'];

export default function TelegramDashboardPage() {
  const { currentUser } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [sources, setSources] = useState<TelegramSource[]>([]);
  const [messages, setMessages] = useState<TelegramMsg[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ chatId: '', chatTitle: '', topicId: '', topicName: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('telegram.manage');
  const canView = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('telegram.view');

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [st, src, msgs] = await Promise.all([
        crmApi('/api/telegram/status'),
        crmApi('/api/telegram/sources'),
        crmApi('/api/telegram/messages' + (statusFilter ? `?status=${statusFilter}` : '')),
      ]);
      setStatus(st);
      setSources(src.sources || []);
      setMessages(msgs.messages || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ط¨ظٹط§ظ†ط§طھ');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (canView !== false) loadAll();
  }, [loadAll, canView]);

  if (!canView) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-[#697586]">ظ„ظٹط³ ظ„ط¯ظٹظƒ طµظ„ط§ط­ظٹط© ظ„ط¹ط±ط¶ طھظƒط§ظ…ظ„ طھظٹظ„ظٹط¬ط±ط§ظ…</div>
      </AppLayout>
    );
  }

  const addSource = async () => {
    setFormError(null);
    setSaving(true);
    try {
      await crmApi('/api/telegram/sources', {
        method: 'POST',
        body: JSON.stringify({
          chatId: form.chatId.trim(),
          chatType: 'supergroup',
          chatTitle: form.chatTitle.trim() || null,
          topicId: form.topicId.trim() ? Number(form.topicId.trim()) : null,
          topicName: form.topicName.trim() || null,
          isActive: true,
        }),
      });
      setAddOpen(false);
      setForm({ chatId: '', chatTitle: '', topicId: '', topicName: '' });
      await loadAll(true);
    } catch (e: any) {
      setFormError(e?.message || 'طھط¹ط°ط± ط¥ط¶ط§ظپط© ط§ظ„ظ…طµط¯ط±');
    } finally {
      setSaving(false);
    }
  };

  const toggleSource = async (s: TelegramSource) => {
    setBusyId(s.id);
    try {
      await crmApi(`/api/telegram/sources/${s.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !s.isActive }) });
      await loadAll(true);
    } catch (e: any) {
      setError(e?.message || 'طھط¹ط°ط± ط§ظ„طھط­ط¯ظٹط«');
    } finally {
      setBusyId(null);
    }
  };

  const deleteSource = async (s: TelegramSource) => {
    if (!confirm(`ط­ط°ظپ ط§ظ„ط±ط¨ط· ظ…ط¹ "${s.chatTitle || s.chatId}"طں ظ„ظ† ظٹطھظ… ط­ط°ظپ ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ط³ط§ط¨ظ‚ط©.`)) return;
    setBusyId(s.id);
    try {
      await crmApi(`/api/telegram/sources/${s.id}`, { method: 'DELETE' });
      await loadAll(true);
    } catch (e: any) {
      setError(e?.message || 'طھط¹ط°ط± ط§ظ„ط­ط°ظپ');
    } finally {
      setBusyId(null);
    }
  };

  const testSource = async (s: TelegramSource) => {
    setBusyId(s.id);
    try {
      const r: any = await crmApi(`/api/telegram/sources/${s.id}/test`, { method: 'POST' });
      alert(r.lastMessage ? `ط¢ط®ط± ط±ط³ط§ظ„ط©: ${new Date(r.lastMessage.createdAt).toLocaleString('ar')} â€” ط§ظ„ط­ط§ظ„ط©: ${STATUS_LABELS[r.lastMessage.processingStatus] || r.lastMessage.processingStatus}` : 'ظ„ط§ طھظˆط¬ط¯ ط±ط³ط§ط¦ظ„ ظ…ط³طھظ„ظ…ط© ظ…ظ† ظ‡ط°ظ‡ ط§ظ„ظ…ط¬ظ…ظˆط¹ط© ط¨ط¹ط¯');
    } catch (e: any) {
      setError(e?.message || 'طھط¹ط°ط± ط§ظ„ط§ط®طھط¨ط§ط±');
    } finally {
      setBusyId(null);
    }
  };

  const retryMessage = async (m: TelegramMsg) => {
    setBusyId(m.id);
    try {
      const r: any = await crmApi(`/api/telegram/messages/${m.id}/retry`, { method: 'POST' });
      if (r.status === 'PROCESSED') await loadAll(true);
      else setError(REVIEW_REASONS[r.reason] || 'ظ„ط§ ظٹط²ط§ظ„ ظ„ط§ ظٹظ…ظƒظ† ط¥ظ†ط´ط§ط، ط§ظ„ط·ظ„ط¨');
    } catch (e: any) {
      setError(e?.message || 'طھط¹ط°ط± ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط©');
    } finally {
      setBusyId(null);
    }
  };

  const connected = status?.botConfigured && status?.botApiOk;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#121926] flex items-center gap-2">
              <Send className="w-5 h-5 text-[#229ED9]" /> طھظƒط§ظ…ظ„ طھظٹظ„ظٹط¬ط±ط§ظ…
            </h1>
            <p className="text-xs text-[#697586] mt-1">طھط­ظˆظٹظ„ ط±ط³ط§ط¦ظ„ ظ…ط¬ظ…ظˆط¹ط§طھ طھظٹظ„ظٹط¬ط±ط§ظ… ط¥ظ„ظ‰ ط·ظ„ط¨ط§طھ طھظ„ظ‚ط§ط¦ظٹظ‹ط§</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboards/telegram/settings">
              <Button variant="outline" size="sm"><Settings className="w-4 h-4 ml-1" /> ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ</Button>
            </Link>
            {canManage && (
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 ml-1" /> ط¥ط¶ط§ظپط© ظ…ط¬ظ…ظˆط¹ط©</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => loadAll()}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 text-rose-800 px-3 py-2.5 text-xs flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 cursor-pointer">âœ•</button>
          </div>
        )}

        {/* Connection status */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-sm font-semibold text-[#121926]">{connected ? 'ظ…طھطµظ„' : 'ط؛ظٹط± ظ…طھطµظ„'}</span>
            </div>
            <div className="text-xs text-[#697586]">
              ط§ظ„ط¨ظˆطھ: {status?.botUsername ? <span dir="ltr" className="font-mono">@{status.botUsername}</span> : 'ط؛ظٹط± ظ…ط¹ط±ظˆظپ'}
            </div>
            <div className="text-xs text-[#697586]">
              ط§ظ„ظˆظٹط¨ظ‡ظˆظƒ: {status?.telegramWebhookSet ? <span className="text-emerald-600 font-semibold">ظ…ظڈط³ط¬ظ„</span> : <span className="text-rose-600 font-semibold">ط؛ظٹط± ظ…ظڈط³ط¬ظ„</span>}
            </div>
            <div className="text-xs text-[#697586]">ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ ط§ظ„ظ…ط±طھط¨ط·ط©: <span className="font-semibold text-[#121926]">{status?.sourcesCount ?? 0}</span></div>
            <Link href="/dashboards/telegram/settings" className="text-xs text-[#b8256e] hover:underline mr-auto">طھظپط§طµظٹظ„ ط§ظ„ط§طھطµط§ظ„ â†گ</Link>
          </CardContent>
        </Card>

        {/* Order processing stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'CREATED', label: 'ط·ظ„ط¨ط§طھ ظ…ظڈظ†ط´ط£ط©', icon: ShoppingBag, color: 'text-emerald-600' },
            { key: 'NEEDS_REVIEW', label: 'طھط­طھط§ط¬ ظ…ط±ط§ط¬ط¹ط©', icon: MessageSquare, color: 'text-rose-600' },
            { key: 'IGNORED', label: 'ظ…طھط¬ط§ظ‡ظ„ط©', icon: CheckCircle2, color: 'text-[#697586]' },
            { key: 'FAILED', label: 'ظپط´ظ„طھ', icon: XCircle, color: 'text-red-600' },
          ].map((s) => (
            <Card key={s.key}>
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div>
                  <p className="text-lg font-bold text-[#121926]">{status?.stats?.[s.key] ?? 0}</p>
                  <p className="text-[10px] text-[#697586]">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sources */}
        <Card>
          <CardHeader title={<h2 className="text-sm font-bold text-[#121926]">ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ ظˆط§ظ„ظ…ظˆط§ط¶ظٹط¹ ط§ظ„ظ…ط±طھط¨ط·ط©</h2>} className="border-b-0 pb-0 px-6 pt-4" />
          <CardContent className="p-0 mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3 text-right">ط§ظ„ظ…ط¬ظ…ظˆط¹ط©</th>
                    <th className="px-4 py-3 text-right">ط§ظ„ظ†ظˆط¹</th>
                    <th className="px-4 py-3 text-right">ط§ظ„ط­ط§ظ„ط©</th>
                    <th className="px-4 py-3 text-right">ط§ظ„ط·ظ„ط¨ط§طھ</th>
                    <th className="px-4 py-3 text-right">ط¢ط®ط± ط±ط³ط§ظ„ط©</th>
                    <th className="px-4 py-3 text-left">ط¥ط¬ط±ط§ط،ط§طھ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {sources.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-[#9ca3af]">{loading ? 'ط¬ط§ط±ظچ ط§ظ„طھط­ظ…ظٹظ„...' : 'ظ„ط§ طھظˆط¬ط¯ ظ…ط¬ظ…ظˆط¹ط§طھ ظ…ط±طھط¨ط·ط© ط¨ط¹ط¯'}</td></tr>
                  ) : sources.map((s) => (
                    <tr key={s.id} className="hover:bg-[#f8fafc]">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#121926]">{s.chatTitle || 'ط¨ط¯ظˆظ† ط¹ظ†ظˆط§ظ†'}</p>
                        <p className="text-[10px] text-[#697586] font-mono" dir="ltr">{s.chatId}{s.topicId ? ` â€¢ topic ${s.topicId}` : ''}</p>
                        {s.topicName && <p className="text-[10px] text-[#697586]">ط§ظ„ظ…ظˆط¶ظˆط¹: {s.topicName}</p>}
                      </td>
                      <td className="px-4 py-3 text-[#697586]">{s.chatType === 'supergroup' ? 'ظ…ط¬ظ…ظˆط¹ط© ظپط§ط¦ظ‚ط©' : s.chatType === 'group' ? 'ظ…ط¬ظ…ظˆط¹ط©' : 'ظ‚ظ†ط§ط©'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.isActive ? 'bg-[#e6f9ee] text-[#00a651]' : 'bg-[#f1f5f9] text-[#697586]'}`}>
                          {s.isActive ? 'ظ…ظپط¹ظ‘ظ„' : 'ظ…ط¹ط·ظ„'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#121926]">{s.ordersCount}</td>
                      <td className="px-4 py-3 text-[#697586]">{s.lastMessageAt ? new Date(s.lastMessageAt).toLocaleString('ar') : 'â€”'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button disabled={busyId === s.id} onClick={() => testSource(s)} title="ط§ط®طھط¨ط§ط±" className="p-1.5 rounded hover:bg-[#f1f5f9] text-[#697586]"><FlaskConical className="w-4 h-4" /></button>
                          <button disabled={busyId === s.id} onClick={() => toggleSource(s)} title={s.isActive ? 'طھط¹ط·ظٹظ„' : 'طھظپط¹ظٹظ„'} className="p-1.5 rounded hover:bg-[#f1f5f9] text-[#697586]"><Power className="w-4 h-4" /></button>
                          <button disabled={busyId === s.id} onClick={() => deleteSource(s)} title="ط­ط°ظپ" className="p-1.5 rounded hover:bg-rose-50 text-rose-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent messages */}
        <Card>
          <CardHeader
            title={<h2 className="text-sm font-bold text-[#121926]">ط§ظ„ط±ط³ط§ط¦ظ„ ط§ظ„ط£ط®ظٹط±ط©</h2>}
            className="border-b-0 pb-0 px-6 pt-4"
            action={
              <div className="w-40">
                <Select value={statusFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)} className="text-xs py-1.5">
                  <option value="">ظƒظ„ ط§ظ„ط­ط§ظ„ط§طھ</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
            }
          />
          <CardContent className="p-0 mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#f8fafc] border-b border-[#e3e8ef] text-[#697586] font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3 text-right">ط§ظ„ط±ط³ط§ظ„ط©</th>
                    <th className="px-4 py-3 text-right">ط§ظ„ظ…ط¬ظ…ظˆط¹ط©</th>
                    <th className="px-4 py-3 text-right">ط§ظ„ظ…ظˆط¶ظˆط¹</th>
                    <th className="px-4 py-3 text-right">ط§ظ„ط­ط§ظ„ط©</th>
                    <th className="px-4 py-3 text-right">ط§ظ„ط·ظ„ط¨</th>
                    <th className="px-4 py-3 text-right">ط§ظ„ظˆظ‚طھ</th>
                    <th className="px-4 py-3 text-left">ط¥ط¬ط±ط§ط،</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e8ef]">
                  {messages.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-[#9ca3af]">{loading ? 'ط¬ط§ط±ظچ ط§ظ„طھط­ظ…ظٹظ„...' : 'ظ„ط§ طھظˆط¬ط¯ ط±ط³ط§ط¦ظ„'}</td></tr>
                  ) : messages.map((m) => (
                    <tr key={m.id} className="hover:bg-[#f8fafc]">
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className="truncate text-[#121926]">{m.text || 'â€”'}</p>
                        <p className="text-[10px] text-[#697586]">{m.senderName || 'ظ…ط¬ظ‡ظˆظ„'}</p>
                      </td>
                      <td className="px-4 py-3 text-[#697586]">{m.source?.chatTitle || m.chatId}</td>
                      <td className="px-4 py-3 text-[#697586]">{m.threadName || m.source?.topicName || (m.threadId ? m.threadId : 'â€”')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[m.processingStatus] || ''}`}>
                          {STATUS_LABELS[m.processingStatus] || m.processingStatus}
                        </span>
                        {m.reviewReason && <p className="text-[10px] text-[#e11d48] mt-0.5">{REVIEW_REASONS[m.reviewReason] || m.reviewReason}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {m.order ? <span className="font-mono text-[#b8256e] font-semibold">{m.order.orderNumber}</span> : 'â€”'}
                      </td>
                      <td className="px-4 py-3 text-[#697586]">{new Date(m.createdAt).toLocaleString('ar')}</td>
                      <td className="px-4 py-3 text-left">
                        {['NEEDS_REVIEW', 'FAILED'].includes(m.processingStatus) && canManage && (
                          <Button size="sm" variant="outline" disabled={busyId === m.id} onClick={() => retryMessage(m)}>
                            <RotateCcw className="w-3 h-3 ml-1" /> ط¥ط¹ط§ط¯ط©
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Add Source modal */}
        <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="ط¥ط¶ط§ظپط© ظ…ط¬ظ…ظˆط¹ط© طھظٹظ„ظٹط¬ط±ط§ظ…">
          <div className="space-y-4" dir="rtl">
            <div>
              <label className="text-xs font-semibold text-[#121926] block mb-1">Chat ID *</label>
              <Input value={form.chatId} onChange={(e) => setForm({ ...form, chatId: e.target.value })} placeholder="-1001234567890" dir="ltr" className="text-left font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#121926] block mb-1">ط§ط³ظ… ط§ظ„ظ…ط¬ظ…ظˆط¹ط©</label>
              <Input value={form.chatTitle} onChange={(e) => setForm({ ...form, chatTitle: e.target.value })} placeholder="ظ…ط¬ظ…ظˆط¹ط© ط·ظ„ط¨ط§طھ ط§ظ„ظ…طھط¬ط±" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#121926] block mb-1">Topic ID (ط§ط®طھظٹط§ط±ظٹ)</label>
                <Input value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value })} placeholder="ط§طھط±ظƒظ‡ ظپط§ط±ط؛ظ‹ط§ ظ„ط±ط¨ط· ط§ظ„ظ…ط¬ظ…ظˆط¹ط© ظƒط§ظ…ظ„ط©" dir="ltr" className="text-left font-mono" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#121926] block mb-1">ط§ط³ظ… ط§ظ„ظ…ظˆط¶ظˆط¹</label>
                <Input value={form.topicName} onChange={(e) => setForm({ ...form, topicName: e.target.value })} />
              </div>
            </div>
            {formError && <p className="text-xs text-rose-600">{formError}</p>}
            <p className="text-[10px] text-[#697586] leading-relaxed">
              طھط£ظƒط¯ ظ…ظ† ط¥ط¶ط§ظپط© ط§ظ„ط¨ظˆطھ ط¥ظ„ظ‰ ط§ظ„ظ…ط¬ظ…ظˆط¹ط© ظˆظ…ظ† طھظپط¹ظٹظ„ Privacy Mode ط§ظ„ظ…ظ†ط§ط³ط¨. ط§طھط±ظƒ Topic ID ظپط§ط±ط؛ظ‹ط§ ظ„ط±ط¨ط· ط§ظ„ظ…ط¬ظ…ظˆط¹ط© ط¨ط§ظ„ظƒط§ظ…ظ„.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>ط¥ظ„ط؛ط§ط،</Button>
              <Button size="sm" disabled={!form.chatId.trim() || saving} onClick={addSource}>{saving ? 'ط¬ط§ط±ظچ ط§ظ„ط­ظپط¸...' : 'ط¥ط¶ط§ظپط©'}</Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
