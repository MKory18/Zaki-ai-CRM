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

  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('suspended=1')) {
      setError('تم إيقاف حسابك. يرجى التواصل مع المدير.');
    }
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
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.svg" alt="Zaki AI" className="w-20 h-16 object-contain" />
          <h1 className="text-2xl font-bold tracking-tight text-white">Zaki AI Store</h1>
          <p className="text-xs text-zinc-500">
            نظام المبيعات والطلبات والأرباح والذكاء الاصطناعي
          </p>
        </div>

        <Card className="shadow-2xl border-zinc-800 bg-zinc-900">
          <CardContent className="p-6 space-y-4">
            {error && (
              <div
                className={`p-3 text-xs rounded-lg flex items-start space-x-2 rtl:space-x-reverse ${
                  pendingFlag
                    ? 'bg-amber-950/50 border border-amber-900 text-amber-300'
                    : 'bg-red-950/50 border border-red-900 text-red-300'
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
                className="bg-zinc-950 border-zinc-700 text-white"
              />

              <Input
                label="كلمة المرور"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-zinc-950 border-zinc-700 text-white"
              />

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center space-x-2 rtl:space-x-reverse text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-950 accent-red-600"
                  />
                  <span>تذكرني</span>
                </label>
                <Link href="/forgot-password" className="text-red-400 hover:underline">
                  نسيت كلمة المرور؟
                </Link>
              </div>

              <Button type="submit" loading={loading} className="w-full bg-red-600 hover:bg-red-700">
                <LogIn className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                تسجيل الدخول
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-zinc-500">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="text-red-400 font-semibold hover:underline">
            أنشئ حساباً جديداً
          </Link>{' '}
          — سيكون بانتظار موافقة المدير
        </p>
      </div>
    </div>
  );
}
