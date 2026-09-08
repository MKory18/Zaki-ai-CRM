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
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.svg" alt="Zaki AI" className="w-20 h-16 object-contain" />
          <h1 className="text-2xl font-semibold text-[#252f4a]">إنشاء حساب جديد</h1>
          <p className="text-xs text-[#6b7177]">
            Zaki AI Store — نظام إدارة المبيعات والطلبات والأرباح
          </p>
        </div>

        <Card className="shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
          <CardContent className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-[#fbeeef] border border-[#f4d7da] text-[#d13b4c] text-xs rounded-lg flex items-center space-x-2 rtl:space-x-reverse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-[#e8f8ef] border border-[#d2f0de] text-[#25b865] text-xs rounded-lg flex items-center space-x-2 rtl:space-x-reverse">
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
                className="bg-white"
              />

              <Input
                label="البريد الإلكتروني *"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white"
              />

              <div>
                <Input
                  label="كلمة المرور *"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-white"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {passwordChecks.map((c) => (
                    <span
                      key={c.label}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        c.ok
                          ? 'bg-[#e8f8ef] text-[#25b865] border-[#d2f0de]'
                          : 'bg-[#f8f9fa] text-[#6b7177] border-[#eef0f3]'
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
                className="bg-white"
              />

              <Button type="submit" loading={loading} className="w-full">
                <UserPlus className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                إنشاء الحساب
              </Button>
            </form>

            <div className="p-3 bg-[#f8f9fa] border border-[#eef0f3] rounded-[8px] flex items-start space-x-2 rtl:space-x-reverse text-[11px] text-[#4b5675]">
              <Clock className="w-4 h-4 text-[#e49e3d] shrink-0 mt-0.5" />
              <span>
                بعد التسجيل يكون حسابك بحالة <strong className="text-[#252f4a]">بانتظار الموافقة</strong>،
                ويقوم مدير النظام بتعيين دورك وتنشيط حسابك قبل الوصول للوحدات.
              </span>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-[#6b7177]">
          لديك حساب؟{' '}
          <Link href="/login" className="text-[#3e97ff] font-semibold hover:underline">
            تسجيل الدخول
          </Link>
          {' • '}
          <Link href="/forgot-password" className="text-[#4b5675] hover:underline">
            نسيت كلمة المرور؟
          </Link>
        </p>
      </div>
    </div>
  );
}
