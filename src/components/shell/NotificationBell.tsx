'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, Loader2 } from 'lucide-react';
import { apiJson } from '@/lib/api-client';
import { arDateShort } from '@/lib/format';
import type { NotificationType } from '@/lib/notification';

/**
 * The bell.
 *
 * Eleven places in the system create notifications, all through
 * createNotification, which writes one row per person it concerns. The bell
 * shows only this person's rows for the store they have selected; who gets
 * what, and what a click may open, is decided on the server.
 *
 * The unread count is polled with the count-only query (one COUNT, no rows)
 * and the list is fetched only when the panel opens. Polling stops while the
 * tab is hidden: a background tab asking every minute for a number nobody
 * is looking at is just load.
 */

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

/**
 * The kinds, in words. A badge reading ORDER_NEW tells a person nothing.
 * Keyed by the server's own type list, so a kind added there without a
 * label here does not compile — two of the jobs' kinds shipped showing
 * their raw English name that way.
 */
const TYPE_AR: Record<NotificationType, string> = {
  ORDER_NEW: 'طلب جديد',
  FOLLOW_UP: 'متابعة',
  LOW_STOCK: 'مخزون منخفض',
  HIGH_REJECTION: 'رفض مرتفع',
  CLOSING_DUE: 'إغلاق مستحق',
  POSTPONED_DUE: 'مؤجَّل حان موعده',
  RETURNS_NOT_RECEIVED: 'مرتجعات لم تُستلم',
  PERFORMANCE: 'أداء',
  SYSTEM_ALERT: 'تنبيه',
};

const TONE: Record<NotificationType, string> = {
  ORDER_NEW: 'bg-[#eef4ff] text-[#2563eb]',
  FOLLOW_UP: 'bg-[#fff7ed] text-[#c2410c]',
  LOW_STOCK: 'bg-[#fefce8] text-[#a16207]',
  HIGH_REJECTION: 'bg-[#feecee] text-[#fb323f]',
  CLOSING_DUE: 'bg-[#f5f3ff] text-[#6d28d9]',
  POSTPONED_DUE: 'bg-[#fff7ed] text-[#c2410c]',
  RETURNS_NOT_RECEIVED: 'bg-[#fefce8] text-[#a16207]',
  PERFORMANCE: 'bg-[#ecfdf5] text-[#047857]',
  SYSTEM_ALERT: 'bg-[#f8fafc] text-[#697586]',
};

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await apiJson<{ unreadCount: number }>('/api/notifications?countOnly=1');
      setUnread(res.unreadCount ?? 0);
    } catch {
      // A failed poll is not worth a message; the next one will do.
    }
  }, []);

  useEffect(() => {
    void loadCount();
    const timer = setInterval(() => {
      if (!document.hidden) void loadCount();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void loadCount();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadCount]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setItems(null);
    try {
      const res = await apiJson<{ notifications: Notification[]; unreadCount: number }>('/api/notifications');
      setItems(res.notifications ?? []);
      setUnread(res.unreadCount ?? 0);
    } catch {
      setItems([]);
    }
  }

  async function markAll() {
    setBusy(true);
    try {
      await apiJson('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      setItems((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? null);
      setUnread(0);
    } finally {
      setBusy(false);
    }
  }

  async function openItem(n: Notification) {
    if (!n.isRead) {
      apiJson('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: n.id }),
      }).catch(() => undefined);
      setUnread((c) => Math.max(0, c - 1));
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) ?? null);
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `${unread} إشعار غير مقروء` : 'الإشعارات'}
        className="relative p-2 rounded-[8px] text-[#697586] hover:text-[#b8256e] hover:bg-[#f8fafc] transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#fb323f] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          dir="rtl"
          className="absolute z-40 mt-1 end-0 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-[#e3e8ef] bg-white shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#e3e8ef] bg-[#f8fafc]">
            <span className="text-xs font-bold text-[#121926]">الإشعارات</span>
            {unread > 0 && (
              <button
                onClick={markAll}
                disabled={busy}
                className="text-[11px] text-[#b8256e] hover:underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-xs text-[#9aa4b2] flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> جارٍ التحميل…
              </p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-xs text-[#9aa4b2] text-center">لا إشعارات.</p>
            ) : (
              <ul className="divide-y divide-[#e3e8ef]">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => openItem(n)}
                      className={`w-full text-start px-4 py-2.5 hover:bg-[#f8fafc] transition-colors ${
                        n.isRead ? '' : 'bg-[#fdf5fa]/60'
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        {!n.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#b8256e] mt-1.5 shrink-0" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${TONE[n.type as NotificationType] ?? TONE.SYSTEM_ALERT}`}>
                              {TYPE_AR[n.type as NotificationType] ?? TYPE_AR.SYSTEM_ALERT}
                            </span>
                            <span className="text-[10px] text-[#9aa4b2]">{arDateShort(n.createdAt)}</span>
                          </span>
                          <span className={`block text-xs mt-1 ${n.isRead ? 'text-[#697586]' : 'text-[#121926] font-medium'}`}>
                            {n.title}
                          </span>
                          <span className="block text-[11px] text-[#9aa4b2] mt-0.5 break-words">{n.message}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
