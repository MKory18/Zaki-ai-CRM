'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { screenApi as crmApi, qs } from '@/lib/screen-api';
import {
  MessageCircle, Send, ChevronRight, Phone, ShoppingBag, User,
  RefreshCw, Settings, ShieldAlert, Check, X, Search, CheckCheck, AlertCircle,
} from 'lucide-react';

interface Conversation {
  id: string;
  customerPhone: string;
  customerName: string | null;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview?: string | null;
  assignedUserId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  customerId?: string | null;
  customer?: { id: string; fullName: string; phone: string; rawPhone?: string; city?: string } | null;
}

interface WMsg {
  id: string;
  direction: string;
  messageType: string;
  text: string | null;
  status: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  CONNECTED: 'bg-[#e6f9ee] text-[#00a651]',
  NEEDS_SETUP: 'bg-[#fff7e6] text-[#b8860b]',
};

export function WhatsAppInboxScreen() {
  const { currentUser } = useApp();
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<WMsg[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  const [composing, setComposing] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryText, setRetryText] = useState<string | null>(null);

  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const canSend = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('whatsapp.send');
  const canManage = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('whatsapp.manage');
  const canAssign = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('whatsapp.assign');
  const canView = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'COMPANY_ADMIN' || currentUser?.permissions?.includes('whatsapp.view');

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const inFlightRef = useRef(false);

  const loadConnection = useCallback(async () => {
    try {
      const d: any = await crmApi('/api/whatsapp/connection');
      setConn(d);
      setOffline(false);
      return d;
    } catch (e: any) {
      if (/network|fetch/i.test(String(e))) setOffline(true);
      setError(e.message || null);
      return null;
    }
  }, []);

  const loadConversations = useCallback(async (silent = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const d: any = await crmApi('/api/whatsapp/conversations' + qs({ status: statusFilter, q: search }));
      const list: Conversation[] = d.conversations || [];
      setConversations((prev) => {
        // Preserve order/merge without flashing during silent polling
        if (silent && prev.length && list.length &&
            prev[0].id === list[0].id && prev.length === list.length &&
            prev.every((p, i) => p.unreadCount === list[i].unreadCount)) {
          return prev.map((p, i) => ({ ...p, ...list[i] }));
        }
        return list;
      });
      setOffline(false);
      setError(null);
    } catch (e: any) {
      if (/network|fetch/i.test(String(e))) setOffline(true);
      if (!silent) setError(e.message || 'تعذر تحميل المحادثات');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [statusFilter, search]);

  const loadMessages = useCallback(async (convId: string, silent = false) => {
    if (silent && inFlightRef.current) return;
    if (silent) inFlightRef.current = true;
    try {
      const after = silent && messages.length ? messages[messages.length - 1].createdAt : '';
      const d: any = await crmApi(`/api/whatsapp/conversations/${convId}` + qs({ after }));
      if (selectedIdRef.current !== convId) return;
      const conv = d.conversation;
      setSelected((s) => ({ ...(s || conv), ...conv }));
      if (!after) setRecentOrders(d.recentOrders || []);
      if (after) {
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...prev, ...(d.messages || []).filter((m: WMsg) => !known.has(m.id))];
        });
        const hasNewInbound = (d.messages || []).some((m: WMsg) => m.direction === 'INBOUND');
        if (hasNewInbound) {
          crmApi(`/api/whatsapp/conversations/${convId}/read`, { method: 'POST' }).catch(() => {});
        }
      } else {
        setMessages(d.messages || []);
        if (conv.unreadCount > 0) {
          crmApi(`/api/whatsapp/conversations/${convId}/read`, { method: 'POST' }).catch(() => {});
          setSelected((s) => (s ? { ...s, unreadCount: 0 } : s));
        }
      }
    } catch (e: any) {
      if (/network|fetch/i.test(String(e))) setOffline(true);
      if (!silent) setError(e.message || 'تعذر تحميل الرسائل');
    } finally {
      if (silent) inFlightRef.current = false;
      setMsgsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Initial load
  useEffect(() => {
    if (!canView) { setLoading(false); return; }
    (async () => {
      const c = await loadConnection();
      if (c?.status === 'CONNECTED') await loadConversations();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling — only while the page is visible (no request storm, no stale
  // closures: callbacks are stable and guarded by inFlightRef/selectedIdRef)
  useEffect(() => {
    if (!canView) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      loadConversations(true);
      if (selectedIdRef.current) loadMessages(selectedIdRef.current, true);
    };
    const iv = setInterval(tick, 5000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onVis);
    };
  }, [canView, loadConversations, loadMessages]);

  const selectConversation = (c: Conversation) => {
    setSelectedId(c.id);
    setSelected(c);
    setMessages([]);
    setMsgsLoading(true);
    setSendError(null);
    setRetryText(null);
    setMobileView('chat');
    loadMessages(c.id);
  };

  const sendMessage = async () => {
    if (!selectedId || !composing.trim() || sending) return;
    setSending(true); setSendError(null); setRetryText(null);
    const text = composing.trim();
    try {
      const d: any = await crmApi(`/api/whatsapp/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setMessages((prev) => [...prev, d.message]);
      setComposing('');
      setConversations((prev) => prev.map((c) => c.id === selectedId
        ? { ...c, lastMessagePreview: text.slice(0, 120), lastMessageAt: new Date().toISOString() } : c));
    } catch (e: any) {
      setSendError(e.message || 'تعذر إرسال الرسالة');
      setRetryText(text);
    } finally {
      setSending(false);
    }
  };

  const retrySend = async () => {
    if (!retryText) return;
    setComposing(retryText);
    setRetryText(null);
    setSendError(null);
    setTimeout(() => sendMessage(), 50);
  };

  const toggleStatus = async () => {
    if (!selected) return;
    const next = selected.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    try {
      await crmApi(`/api/whatsapp/conversations/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      setSelected({ ...selected, status: next });
      loadConversations(true);
    } catch (e: any) {
      setSendError(e.message || 'تعذر تغيير حالة المحادثة');
    }
  };

  const assign = async (userId: string | null) => {
    if (!selected) return;
    setAssigning(true);
    try {
      const d: any = await crmApi(`/api/whatsapp/conversations/${selected.id}/assign`, {
        method: 'POST', body: JSON.stringify({ userId }),
      });
      setSelected({ ...selected, assignedUserId: d.assignedUserId, assignedTo: d.assignedTo });
      loadConversations(true);
    } catch (e: any) {
      setSendError(e.message || 'تعذر التعيين');
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    if (canAssign) {
      crmApi('/api/whatsapp/users').then((d: any) => setUsers(d.users || [])).catch(() => {});
    }
  }, [canAssign]);

  const connected = conn?.status === 'CONNECTED';
  const convCountByPhone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of conversations) m[c.customerPhone] = (m[c.customerPhone] || 0) + 1;
    return m;
  }, [conversations]);

  // ─── Permission gate ───
  if (!canView) {
    return (
      <>
        <div className="p-8">
          <div className="max-w-md mx-auto mt-20 text-center p-8 bg-white rounded-xl border border-[#e2e8f0]">
            <ShieldAlert className="w-10 h-10 mx-auto text-[#b8256e]" />
            <h2 className="mt-4 font-bold text-[#121926]">ليس لديك صلاحية لعرض واتساب</h2>
            <p className="mt-2 text-xs text-[#697586]">تواصل مع مدير الشركة لمنحك صلاحية whatsapp.view</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-72px)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#121926]">واتساب</h1>
            <p className="text-xs text-[#697586] mt-1">صندوق وارد مشترك لكل الموظفين — WhatsApp Business Cloud API</p>
          </div>
          {conn?.connection && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[conn.status] || STATUS_COLORS.NEEDS_SETUP}`}>
              <span className={`w-2 h-2 rounded-full ${conn.status === 'CONNECTED' ? 'bg-[#00a651]' : 'bg-[#b8860b]'}`} />
              {conn.status === 'CONNECTED' ? 'متصل' : 'يحتاج إعداد'}
            </span>
          )}
        </div>

        {/* No connection state */}
        {!loading && conn && conn.status !== 'CONNECTED' ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center p-10 bg-white rounded-2xl border border-[#e2e8f0] max-w-md">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#f8fafc] flex items-center justify-center">
                <MessageCircle className="w-7 h-7 text-[#697586]" />
              </div>
              <h2 className="mt-4 font-bold text-[#121926]">لم يتم ربط WhatsApp بعد</h2>
              <p className="mt-2 text-xs text-[#697586] leading-relaxed">
                {conn.envConfigured
                  ? 'تم إعداد البيانات لكن الاتصال غير مفعّل. جرّب إعادة الاتصال من الإعدادات.'
                  : 'أكمل متغيرات البيئة (Access Token, WABA ID, Phone Number ID, App Secret, Verify Token, Encryption Key) ثم اضغط إعادة الاتصال من صفحة الإعدادات.'}
              </p>
              {canManage && (
                <Link href="/settings/whatsapp" className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#b8256e] text-white text-sm font-semibold hover:opacity-90">
                  <Settings className="w-4 h-4" />
                  إعداد WhatsApp
                </Link>
              )}
            </div>
          </div>
        ) : (
          /* 3-pane inbox */
          <div className="flex-1 min-h-0 px-4 md:px-6 pb-4 grid grid-cols-1 lg:grid-cols-[320px_1fr_300px] gap-4 overflow-hidden">
            {/* ── Column 1: conversations list ── */}
            <div className={`bg-white rounded-xl border border-[#e2e8f0] flex flex-col min-h-0 ${mobileView === 'chat' ? 'hidden lg:flex' : 'flex'}`}>
              <div className="p-3 border-b border-[#f0f2f7] space-y-2">
                <div className="relative">
                  <Search className="absolute top-2.5 left-3 w-4 h-4 text-[#9aa4b2] rtl:right-3 rtl:left-auto" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadConversations()}
                    placeholder="بحث برقم أو اسم..."
                    className="w-full pl-9 rtl:pr-9 rtl:pl-3 py-2 text-xs rounded-lg border border-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#b8256e]/20"
                  />
                </div>
                <div className="flex gap-1 text-[11px] font-semibold">
                  {(['OPEN', 'CLOSED'] as const).map((s) => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1 rounded-full ${statusFilter === s ? 'bg-[#b8256e] text-white' : 'bg-[#f8fafc] text-[#697586]'}`}>
                      {s === 'OPEN' ? 'مفتوحة' : 'مغلقة'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {loading ? (
                  <div className="p-6 text-center text-xs text-[#697586]">جارٍ التحميل...</div>
                ) : error && !offline ? (
                  <div className="p-4 m-3 rounded-lg bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs flex flex-col gap-2">
                    <span className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{error}</span>
                    <button onClick={() => { setError(null); loadConversations(); }} className="inline-flex items-center gap-1 text-[#121926] font-semibold">
                      <RefreshCw className="w-3 h-3" /> إعادة المحاولة
                    </button>
                  </div>
                ) : offline ? (
                  <div className="p-4 m-3 rounded-lg bg-[#fff7e6] border border-[#fde68a] text-[#b8860b] text-xs">
                    لا يوجد اتصال بالشبكة — سيتم تحديث الصندوق تلقائيًا عند عودة الاتصال
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#697586]">
                    {statusFilter === 'OPEN' ? 'لا توجد محادثات مفتوحة بعد' : 'لا توجد محادثات مغلقة'}
                  </div>
                ) : (
                  conversations.map((c) => (
                    <button key={c.id} onClick={() => selectConversation(c)}
                      className={`w-full text-right flex items-start gap-3 px-4 py-3 border-b border-[#f7f8fa] hover:bg-[#f8fafc] transition-colors ${selectedId === c.id ? 'bg-[#fdf2f7]' : ''}`}>
                      <div className="w-10 h-10 rounded-full bg-[#121926] text-white flex items-center justify-center shrink-0 text-sm font-bold">
                        {(c.customerName || c.customerPhone).slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-[#121926] truncate">{c.customerName || c.customerPhone}</span>
                          {c.unreadCount > 0 && (
                            <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#b8256e] text-white text-[10px] font-bold flex items-center justify-center">{c.unreadCount}</span>
                          )}
                        </div>
                        <p className="text-xs text-[#697586] truncate mt-0.5">{c.lastMessagePreview || '—'}</p>
                        {c.assignedTo && <p className="text-[10px] text-[#9aa4b2] mt-0.5">مُسندة إلى: {c.assignedTo.name}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ── Column 2: conversation ── */}
            <div className={`bg-white rounded-xl border border-[#e2e8f0] flex flex-col min-h-0 ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
              {!selected ? (
                <div className="flex-1 flex items-center justify-center text-xs text-[#697586]">اختر محادثة لعرضها</div>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f0f2f7]">
                    <button className="lg:hidden text-[#697586]" onClick={() => setMobileView('list')}><ChevronRight className="w-5 h-5 rtl:rotate-180" /></button>
                    <div className="w-9 h-9 rounded-full bg-[#121926] text-white flex items-center justify-center text-xs font-bold">
                      {(selected.customerName || selected.customerPhone).slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#121926] truncate">{selected.customerName || selected.customerPhone}</p>
                      <p className="text-[11px] text-[#697586] truncate" dir="ltr">{selected.customerPhone}</p>
                    </div>
                    <button onClick={toggleStatus}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold ${selected.status === 'OPEN' ? 'bg-[#f8fafc] text-[#697586] hover:bg-[#feecee] hover:text-[#fb323f]' : 'bg-[#e6f9ee] text-[#00a651]'}`}>
                      {selected.status === 'OPEN' ? 'إغلاق المحادثة' : 'إعادة فتح'}
                    </button>
                  </div>

                  {canAssign && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-[#f7f8fa] bg-[#fafbfc]">
                      <span className="text-[11px] text-[#697586] shrink-0">مُسندة إلى:</span>
                      <select
                        value={selected.assignedUserId || ''}
                        disabled={assigning}
                        onChange={(e) => assign(e.target.value || null)}
                        className="text-[11px] border border-[#e2e8f0] rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[#b8256e]/20"
                      >
                        <option value="">غير معين</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-2 bg-[#fafbfc]" dir="ltr">
                    {msgsLoading ? (
                      <div className="text-center text-xs text-[#697586] py-8">جارٍ التحميل...</div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-xs text-[#697586] py-8">لا توجد رسائل بعد</div>
                    ) : (
                      messages.map((m) => (
                        <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.direction === 'OUTBOUND' ? 'bg-[#d9fdd3] text-[#121926]' : 'bg-white text-[#121926] border border-[#eef1f5]'}`}>
                            {m.messageType !== 'TEXT' && !m.text && (
                              <span className="text-[10px] font-semibold text-[#697586]">[{m.messageType}]</span>
                            )}
                            <p className="whitespace-pre-wrap break-words" dir="auto">{m.text || ''}</p>
                            <div className="flex items-center gap-1 justify-end mt-0.5">
                              <span className="text-[9px] text-[#9aa4b2]">{new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                              {m.direction === 'OUTBOUND' && (
                                m.status === 'READ' ? <CheckCheck className="w-3 h-3 text-[#53bdeb]" />
                                : m.status === 'FAILED' ? <X className="w-3 h-3 text-[#fb323f]" />
                                : <Check className="w-3 h-3 text-[#9aa4b2]" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Composer */}
                  {canSend && selected.status === 'OPEN' && (
                    <div className="border-t border-[#f0f2f7] p-3 space-y-2">
                      {sendError && (
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#feecee] border border-[#fecdd1] text-[#fb323f] text-xs">
                          <span className="flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" />{sendError}</span>
                          {retryText && (
                            <button onClick={retrySend} className="shrink-0 inline-flex items-center gap-1 font-semibold text-[#121926]">
                              <RefreshCw className="w-3 h-3" /> إعادة الإرسال
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex items-end gap-2">
                        <textarea
                          value={composing}
                          onChange={(e) => setComposing(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                          }}
                          rows={1}
                          placeholder="اكتب رسالة..."
                          className="flex-1 resize-none max-h-32 px-3 py-2.5 text-sm rounded-xl border border-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#b8256e]/20"
                        />
                        <button onClick={sendMessage} disabled={sending || !composing.trim()}
                          className="shrink-0 w-10 h-10 rounded-full bg-[#b8256e] text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90">
                          {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 rtl:rotate-180" />}
                        </button>
                      </div>
                    </div>
                  )}
                  {selected.status === 'CLOSED' && (
                    <div className="border-t border-[#f0f2f7] p-3 text-center text-[11px] text-[#697586]">المحادثة مغلقة — أعد فتحها للإرسال</div>
                  )}
                  {!canSend && (
                    <div className="border-t border-[#f0f2f7] p-3 text-center text-[11px] text-[#697586]">ليس لديك صلاحية لإرسال الرسائل</div>
                  )}
                </>
              )}
            </div>

            {/* ── Column 3: customer panel ── */}
            <div className={`bg-white rounded-xl border border-[#e2e8f0] overflow-y-auto min-h-0 hidden lg:block`}>
              {!selected ? (
                <div className="flex items-center justify-center h-full text-xs text-[#697586]">لوحة العميل</div>
              ) : (
                <div className="p-4 space-y-5">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-[#121926] text-white flex items-center justify-center text-lg font-bold">
                      {(selected.customerName || selected.customerPhone).slice(0, 2)}
                    </div>
                    <p className="mt-2 font-bold text-sm text-[#121926]">{selected.customerName || 'عميل غير مرتبط'}</p>
                    <p className="text-[11px] text-[#697586] flex items-center justify-center gap-1 mt-1" dir="ltr">
                      <Phone className="w-3 h-3" /> {selected.customerPhone}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#9aa4b2] mb-2">المحادثات</p>
                    <p className="text-xs text-[#697586]">{convCountByPhone[selected.customerPhone] || 1} محادثة (مفتوحة)</p>
                    {selected.customerId ? (
                      <Link href={`/customers?search=${encodeURIComponent(selected.customerPhone)}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#b8256e] hover:underline">
                        <User className="w-3 h-3" /> فتح العميل
                      </Link>
                    ) : (
                      <p className="mt-2 text-[11px] text-[#9aa4b2]">عميل غير مرتبط</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#9aa4b2] mb-2">الطلبات الأخيرة</p>
                    {selected.customerId ? (
                      recentOrders.length === 0 ? (
                        <p className="text-[11px] text-[#9aa4b2]">لا توجد طلبات</p>
                      ) : (
                        <div className="space-y-1.5">
                          {recentOrders.map((o: any) => (
                            <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#f8fafc] hover:bg-[#fdf2f7] text-xs">
                              <span className="font-semibold text-[#121926]" dir="ltr">#{o.orderNumber}</span>
                              <span className="text-[10px] text-[#697586]">{o.status}</span>
                              <span className="font-semibold text-[#121926]" dir="ltr">{o.totalAmount} {o.currency}</span>
                            </Link>
                          ))}
                        </div>
                      )
                    ) : (
                      <p className="text-[11px] text-[#9aa4b2] flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> لا يوجد عميل مرتبط</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
