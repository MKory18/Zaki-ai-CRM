'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Clock,
  Package,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

export default function NotificationsPage() {
  const { t } = useApp();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      loadNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkOneRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      });
      loadNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'ORDER_NEW':
        return <ShoppingBag className="w-4 h-4 text-[#d13b4c]" />;
      case 'FOLLOW_UP':
        return <Clock className="w-4 h-4 text-[#e49e3d]" />;
      case 'LOW_STOCK':
        return <Package className="w-4 h-4 text-[#d13b4c]" />;
      case 'HIGH_REJECTION':
        return <AlertTriangle className="w-4 h-4 text-[#d13b4c]" />;
      default:
        return <Bell className="w-4 h-4 text-[#d13b4c]" />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#252f4a] flex items-center space-x-2">
              <Bell className="w-6 h-6 text-[#d13b4c]" />
              <span>{t.notifications}</span>
              {unreadCount > 0 && (
                <span className="text-xs font-bold bg-[#d13b4c] text-white px-2 py-0.5 rounded-full ml-2">
                  {unreadCount} New
                </span>
              )}
            </h1>
            <p className="text-xs text-[#6b7177] mt-1">
              Section 28 Operational notifications: new leads, callbacks required, low stock & rejection alerts
            </p>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="flex items-center space-x-1.5"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark All as Read</span>
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-[#eef0f3]">
              {notifications.length === 0 ? (
                <div className="p-12 text-center text-[#9ca3af] text-xs">
                  No notifications at this time.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                      n.isRead ? 'bg-white' : 'bg-[#fbe9ea]/40'
                    }`}
                  >
                    <div className="flex items-start space-x-3 rtl:space-x-reverse">
                      <div className="p-2 bg-[#f3f4f6] rounded-lg shrink-0 mt-0.5">
                        {getIcon(n.type)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-bold text-[#252f4a]">{n.title}</h4>
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#d13b4c]" />
                          )}
                        </div>
                        <p className="text-xs text-[#4b5675] mt-1">{n.message}</p>
                        <p className="text-[10px] text-[#9ca3af] mt-1 font-mono">
                          {format(new Date(n.createdAt), 'PPP p')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {n.link && (
                        <Link href={n.link}>
                          <Button size="sm" variant="outline" className="text-xs py-1">
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </Button>
                        </Link>
                      )}
                      {!n.isRead && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleMarkOneRead(n.id)}
                          className="text-xs py-1"
                        >
                          Mark Read
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
