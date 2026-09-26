'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { AlertCircle, LogIn, Clock, ShieldX } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFlag, setPendingFlag] = useState(false);
  // Not an error: nothing went wrong, the phone was put down. Saying so
  // plainly is what stops somebody concluding the app signed them out at
  // random and asking for the whole measure to be removed.
  const [wasIdle, setWasIdle] = useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.search.includes('suspended=1')) {
      setError('تم إيقاف حسابك. يرجى التواصل مع المدير.');
    }
    if (window.location.search.includes('idle=1')) setWasIdle(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPendingFlag(false);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.status === 'PENDING') setPendingFlag(true);
        throw new Error(data.error || 'فشل تسجيل الدخول');
      }

      // Route by server-verified status — never by client-supplied role
      if (data.status === 'PENDING') {
        router.push('/pending');
      } else {
        router.push('/');
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--sys-surface)] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.svg" alt="Zaki AI" className="w-20 h-16 object-contain" />
          <h1 className="text-2xl font-semibold text-[var(--sys-heading)]">Zaki AI Store</h1>
          <p className="text-xs text-[var(--sys-muted-foreground)]">
            نظام المبيعات والطلبات والأرباح والذكاء الاصطناعي
          </p>
        </div>

        <Card className="shadow-card">
          <CardContent className="p-6 space-y-4">
            {wasIdle && !error && (
              <div
                data-testid="idle-notice"
                className="p-3 text-xs rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-muted-foreground)]"
              >
                أُغلقت الجلسة تلقائياً لعدم الاستخدام — حمايةً للجهاز إن تُرك مفتوحاً. سجّل الدخول للمتابعة.
              </div>
            )}

            {error && (
              <div
                className={`p-3 text-xs rounded-lg flex items-start space-x-2 rtl:space-x-reverse ${
                  pendingFlag
                    ? 'bg-[var(--sys-warning-soft)] border border-[var(--sys-warning)] text-[var(--sys-warning)]'
                    : 'bg-[var(--sys-destructive-soft)] border border-[var(--sys-destructive-border)] text-[var(--sys-destructive)]'
                }`}
              >
                {pendingFlag ? (
                  <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>
                  {error}
                  {pendingFlag && (
                    <>
                      {' '}
                      <Link href="/pending" className="underline font-semibold">
                        عرض حالة الحساب
                      </Link>
                    </>
                  )}
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="البريد الإلكتروني"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-[var(--sys-card)]"
              />

              <Input
                label="كلمة المرور"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-[var(--sys-card)]"
              />

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center space-x-2 rtl:space-x-reverse text-[var(--sys-foreground)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-3.5 h-3.5 rounded-lg border-[var(--sys-border)] bg-[var(--sys-card)] accent-[var(--sys-primary)]"
                  />
                  <span>تذكرني</span>
                </label>
                <Link href="/forgot-password" className="text-[var(--sys-primary)] hover:underline">
                  نسيت كلمة المرور؟
                </Link>
              </div>

              <Button type="submit" loading={loading} className="w-full">
                <LogIn className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                تسجيل الدخول
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-[var(--sys-muted-foreground)]">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="text-[var(--sys-primary)] font-semibold hover:underline">
            أنشئ حساباً جديداً
          </Link>{' '}
          — سيكون بانتظار موافقة المدير
        </p>
      </div>
    </div>
  );
}
