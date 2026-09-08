'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(data.message);
      setDevToken(data.devToken || null);
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
          <h1 className="text-2xl font-semibold text-[#252f4a]">استعادة كلمة المرور</h1>
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
              <div className="p-3 bg-[#e8f8ef] border border-[#d2f0de] text-[#25b865] text-xs rounded-lg space-y-2">
                <p className="flex items-center space-x-2 rtl:space-x-reverse">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{success}</span>
                </p>
                {devToken && (
                  <div className="bg-[#f8f9fa] rounded-[5px] p-2.5 border border-[#eef0f3]">
                    <p className="text-[10px] text-[#6b7177] mb-1">وضع التطوير — رابط إعادة التعيين:</p>
                    <Link
                      href={`/reset-password?token=${devToken}`}
                      className="text-[#3e97ff] font-mono text-[11px] break-all hover:underline"
                    >
                      /reset-password?token={devToken.slice(0, 20)}...
                    </Link>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="البريد الإلكتروني المسجل"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white"
              />
              <Button type="submit" loading={loading} className="w-full">
                <KeyRound className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                إرسال رابط إعادة التعيين
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-[#6b7177]">
          <Link href="/login" className="text-[#3e97ff] font-semibold hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
