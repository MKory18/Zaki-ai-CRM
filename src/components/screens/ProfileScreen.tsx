'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useApp } from '@/context/AppContext';
import { User, Lock, Image as ImageIcon, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { ScoreCard } from '@/components/performance/ScoreCard';

export function ProfileScreen() {
  const { currentUser, refreshUser } = useApp();

  const [name, setName] = useState(currentUser?.name || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const payload: any = {};
      if (name !== currentUser?.name) payload.name = name;
      if (avatar !== (currentUser?.avatar || '')) payload.avatar = avatar;
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error('كلمتا المرور غير متطابقتين');
        }
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessage({ type: 'success', text: 'تم حفظ التغييرات بنجاح' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshUser();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#121926] flex items-center space-x-2 rtl:space-x-reverse">
            <User className="w-6 h-6 text-[#fb323f]" />
            <span>الملف الشخصي</span>
          </h1>
          <p className="text-xs text-[#697586] mt-1">
            تحديث بياناتك الشخصية وكلمة المرور — الدور والصلاحيات يديرها المدير فقط
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center space-x-2 rtl:space-x-reverse ${
              message.type === 'success'
                ? 'bg-emerald-100 border-0 text-[#00c853]'
                : 'bg-[#feecee] border border-[#f5c6cb] text-[#fb323f]'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Their own numbers, on their own page, without anybody having to
            grant them anything. A person who cannot see where they stand
            cannot be asked to improve it. */}
        <ScoreCard />

        <form onSubmit={handleSave} className="space-y-6">
          {/* Account info (read-only) */}
          <Card>
            <CardHeader
              title="معلومات الحساب"
              subtitle="تُدار من قِبل مدير النظام — للقراءة فقط"
            />
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-[#9ca3af] block">البريد الإلكتروني</span>
                <span className="font-bold text-[#121926]">{currentUser?.email}</span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-[#9ca3af] block">الدور</span>
                <Badge variant="info">{currentUser?.role}</Badge>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl">
                <span className="text-[#9ca3af] block">حالة الحساب</span>
                <Badge variant={currentUser?.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {currentUser?.status}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Editable profile */}
          <Card>
            <CardHeader
              title="البيانات الشخصية"
              subtitle="الاسم وصورة الملف"
            />
            <CardContent className="space-y-4">
              <Input
                label="الاسم الكامل"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label="رابط صورة الملف (اختياري)"
                placeholder="https://example.com/avatar.jpg"
                value={avatar || ''}
                onChange={(e) => setAvatar(e.target.value)}
              />
              {avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt="معاينة الصورة"
                  className="w-16 h-16 rounded-full object-cover border-2 border-[#f5c6cb]"
                />
              )}
            </CardContent>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader
              title="تغيير كلمة المرور"
              subtitle="اتركها فارغة إن لم ترغب بالتغيير"
            />
            <CardContent className="space-y-4">
              <Input
                label="كلمة المرور الحالية"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="كلمة المرور الجديدة"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Input
                  label="تأكيد كلمة المرور الجديدة"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-[#697586] flex items-center space-x-1.5 rtl:space-x-reverse">
                <ShieldCheck className="w-3.5 h-3.5 text-[#fb323f]" />
                <span>تغيير كلمة المرور يُنهي جميع الجلسات النشطة على حسابك.</span>
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" loading={loading} className="bg-[#fb323f] hover:bg-[#fb323f]/85">
              حفظ التغييرات
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
