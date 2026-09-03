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
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.svg" alt="Zaki AI" className="w-20 h-16 object-contain" />
          <h1 className="text-2xl font-bold tracking-tight text-white">استعادة كلمة المرور</h1>
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
              <div className="p-3 bg-green-950/50 border border-green-900 text-green-300 text-xs rounded-lg space-y-2">
                <p className="flex items-center space-x-2 rtl:space-x-reverse">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{success}</span>
                </p>
                {devToken && (
                  <div className="bg-zinc-950 rounded-lg p-2.5 border border-zinc-800">
                    <p className="text-[10px] text-zinc-500 mb-1">وضع التطوير — رابط إعادة التعيين:</p>
                    <Link
                      href={`/reset-password?token=${devToken}`}
                      className="text-red-400 font-mono text-[11px] break-all hover:underline"
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
                className="bg-zinc-950 border-zinc-700 text-white"
              />
              <Button type="submit" loading={loading} className="w-full bg-red-600 hover:bg-red-700">
                <KeyRound className="w-4 h-4 ml-1.5 rtl:ml-0 rtl:mr-1.5" />
                إرسال رابط إعادة التعيين
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-zinc-500">
          <Link href="/login" className="text-red-400 font-semibold hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
