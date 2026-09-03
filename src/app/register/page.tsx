'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { AlertCircle, UserPlus, ShieldCheck, Clock } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const passwordChecks = [
    { label: '8 أحرف على الأقل', ok: password.length >= 8 },
    { label: 'حرف كبير', ok: /[A-Z]/.test(password) },
    { label: 'حرف صغير', ok: /[a-z]/.test(password) },
    { label: 'رقم', ok: /[0-9]/.test(password) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل إنشاء الحساب');
      }

      setSuccess(data.message);
      setTimeout(() => {
        router.push(data.status === 'PENDING' ? '/pending' : '/');
        router.refresh();
      }, 1200);
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
          <h1 className="text-2xl font-bold tracking-tight text-white">إنشاء حساب جديد</h1>
          <p className="text-xs text-zinc-500">
            Zaki AI Store — نظام إدارة المبيعات والطلبات والأرباح
          </p>
        </div>

        <Card className="shadow-2xl border-zinc-800 bg-zinc-900">
          <CardContent className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-950/50 border border-red-900 text-red-300 text-xs rounded-lg flex items-center space-x-2 rtl:space-x-reverse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-950/50 border border-green-900 text-green-300 text-xs rounded-lg flex items-center space-x-2 rtl:space-x-reverse">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="الاسم الكامل *"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="bg-zinc-950 border-zinc-700 text-white"
              />

              <Input
                label="البريد الإلكتروني *"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-950 border-zinc-700 text-white"
              />

              <div>
                <Input
                  label="كلمة المرور *"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-zinc-950 border-zinc-700 text-white"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {passwordChecks.map((c) => (
                    <span
                      key={c.label}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        c.ok
                          ? 'bg-green-950/60 text-green-400 border-green-900'
                          : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                      }`}
                    >
                      {c.ok ? '✓' : '•'} {c.label}
                    </span>
                  ))}
                </div>
              </div>

              <Input
                label="تأكيد كلمة المرور *"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="bg-zinc-950 border-zinc-700 text-white"
              />

              <Button type="submit" loading={loading} className="w-full bg-red-600 hover:bg-red-700">
                <UserPlus className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                إنشاء الحساب
              </Button>
            </form>

            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-start space-x-2 rtl:space-x-reverse text-[11px] text-zinc-400">
              <Clock className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>
                بعد التسجيل يكون حسابك بحالة <strong className="text-zinc-200">بانتظار الموافقة</strong>،
                ويقوم مدير النظام بتعيين دورك وتنشيط حسابك قبل الوصول للوحدات.
              </span>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-zinc-500">
          لديك حساب؟{' '}
          <Link href="/login" className="text-red-400 font-semibold hover:underline">
            تسجيل الدخول
          </Link>
          {' • '}
          <Link href="/forgot-password" className="text-zinc-400 hover:underline">
            نسيت كلمة المرور؟
          </Link>
        </p>
      </div>
    </div>
  );
}
