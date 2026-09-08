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
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.svg" alt="Zaki AI" className="w-20 h-16 object-contain" />
          <h1 className="text-2xl font-semibold text-[#252f4a]">Zaki AI Store</h1>
          <p className="text-xs text-[#6b7177]">
            نظام المبيعات والطلبات والأرباح والذكاء الاصطناعي
          </p>
        </div>

        <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
          <CardContent className="p-6 space-y-4">
            {error && (
              <div
                className={`p-3 text-xs rounded-lg flex items-start space-x-2 rtl:space-x-reverse ${
                  pendingFlag
                    ? 'bg-[#fdf4e8] border border-[#f9e6cc] text-[#e49e3d]'
                    : 'bg-[#fbeeef] border border-[#f4d7da] text-[#d13b4c]'
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
                className="bg-white"
              />

              <Input
                label="كلمة المرور"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white"
              />

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center space-x-2 rtl:space-x-reverse text-[#4b5675] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#eef0f3] bg-white accent-[#3e97ff]"
                  />
                  <span>تذكرني</span>
                </label>
                <Link href="/forgot-password" className="text-[#3e97ff] hover:underline">
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

        <p className="text-center text-xs text-[#6b7177]">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="text-[#3e97ff] font-semibold hover:underline">
            أنشئ حساباً جديداً
          </Link>{' '}
          — سيكون بانتظار موافقة المدير
        </p>
      </div>
    </div>
  );
}
