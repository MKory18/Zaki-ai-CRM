'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { RiLoader4Line, RiShieldKeyholeLine } from '@remixicon/react';

/**
 * THE SECOND STEP OF SIGNING IN.
 *
 * Two shapes from one component, because they are two halves of one moment:
 * a protected role that has an authenticator types six digits, and one that
 * has none sets it up first. Splitting them into two screens would mean two
 * places holding a challenge ticket that expires in ten minutes.
 *
 * THE RECOVERY CODES ARE SHOWN ONCE AND THE SCREEN SAYS SO. They are hashed
 * on the server, so «show them again» is not a feature that was left out —
 * it is a thing that cannot exist. A person who closes this without keeping
 * them has an authenticator and no way back from a broken phone, which is
 * why the button that moves on is the last thing on the page.
 */

interface Props {
  step: 'enrol' | 'verify';
  challenge: string;
  email: string;
  onSignedIn: (status: string) => void;
  onCancel: () => void;
}

export function SecondFactor({ step, challenge, email, onSignedIn, onCancel }: Props) {
  return step === 'verify' ? (
    <VerifyStep challenge={challenge} onSignedIn={onSignedIn} onCancel={onCancel} />
  ) : (
    <EnrolStep challenge={challenge} email={email} onCancel={onCancel} />
  );
}

function VerifyStep({
  challenge,
  onSignedIn,
  onCancel,
}: {
  challenge: string;
  onSignedIn: (status: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذّر التحقّق');
      onSignedIn(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر التحقّق');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-[var(--sys-muted-foreground)]">
        <RiShieldKeyholeLine className="mt-0.5 h-5 w-5 shrink-0 text-[var(--sys-primary)]" aria-hidden />
        <span>افتح تطبيق المصادقة واكتب الرمز المعروض. أو اكتب أحد رموز الاسترداد إن لم يكن الهاتف بيدك.</span>
      </p>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]">الرمز</span>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="______"
          dir="ltr"
          className="h-11 w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 text-center text-lg tracking-[0.4em] tabular-nums"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] p-2.5 text-sm text-[var(--sys-destructive)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || code.trim().length < 6}
        className="h-11 w-full rounded-lg bg-[var(--sys-primary)] text-sm font-medium text-[var(--sys-primary-foreground)] disabled:opacity-50"
      >
        {busy ? <RiLoader4Line className="mx-auto h-5 w-5 animate-spin" aria-hidden /> : 'تحقّق وادخل'}
      </button>
      <button type="button" onClick={onCancel} className="h-11 w-full text-xs text-[var(--sys-muted-foreground)]">
        رجوع
      </button>
    </form>
  );
}

function EnrolStep({ challenge, email, onCancel }: { challenge: string; email: string; onCancel: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/2fa/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذّر بدء التفعيل');
      setSetup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر بدء التفعيل');
    }
  }, [challenge]);

  useEffect(() => {
    void start();
  }, [start]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/enrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, secret: setup.secret, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذّر التفعيل');
      setCodes(data.recoveryCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر التفعيل');
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-[var(--sys-warning)]/50 bg-[var(--sys-warning-soft)] p-3 text-sm leading-relaxed text-[var(--sys-warning)]">
          <span className="font-bold">احفظ هذه الرموز الآن.</span> تُعرض مرّةً واحدةً ولا يمكن عرضها ثانيةً —
          فهي مخزَّنةٌ مشفّرةً كما تُخزَّن كلمةُ المرور. كلُّ رمزٍ يُستعمل مرّةً، وهو طريقُك للدخول إن ضاع الهاتف.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3">
          {codes.map((c) => (
            <li key={c} className="text-center text-sm font-semibold tabular-nums text-[var(--sys-heading)]" dir="ltr">
              {c}
            </li>
          ))}
        </ul>
        <button
          onClick={onCancel}
          className="h-11 w-full rounded-lg bg-[var(--sys-primary)] text-sm font-medium text-[var(--sys-primary-foreground)]"
        >
          حفظتُها — إلى تسجيل الدخول
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <p className="text-sm leading-relaxed text-[var(--sys-muted-foreground)]">
        دورُك يتطلّب تحقّقاً ثنائيّاً. امسح الرمز بتطبيق مصادقة (Google Authenticator أو ما يشبهه)، ثمّ اكتب
        الرمز الذي يعرضه لإثبات أنّه يعمل.
      </p>

      {setup ? (
        <>
          <div className="flex justify-center">
            <Image
              src={setup.qr}
              alt="رمز الإعداد"
              width={200}
              height={200}
              unoptimized
              className="rounded-lg"
            />
          </div>
          <details className="text-xs text-[var(--sys-muted-foreground)]">
            <summary className="cursor-pointer">لا تستطيع المسح؟ أدخل المفتاح يدويّاً</summary>
            <p className="mt-2 break-all rounded-lg bg-[var(--sys-surface)] p-2 font-mono text-[var(--sys-heading)]" dir="ltr">
              {setup.secret}
            </p>
            <p className="mt-1">الحساب: <span dir="ltr">{email}</span></p>
          </details>
        </>
      ) : (
        !error && <p className="text-center text-sm text-[var(--sys-muted-foreground)]">…يُحضَّر الرمز</p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[var(--sys-heading)]">الرمز من التطبيق</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="______"
          dir="ltr"
          className="h-11 w-full rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 text-center text-lg tracking-[0.4em] tabular-nums"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] p-2.5 text-sm text-[var(--sys-destructive)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !setup || code.trim().length < 6}
        className="h-11 w-full rounded-lg bg-[var(--sys-primary)] text-sm font-medium text-[var(--sys-primary-foreground)] disabled:opacity-50"
      >
        {busy ? <RiLoader4Line className="mx-auto h-5 w-5 animate-spin" aria-hidden /> : 'فعّل التحقّق الثنائيّ'}
      </button>
      <button type="button" onClick={onCancel} className="h-11 w-full text-xs text-[var(--sys-muted-foreground)]">
        رجوع
      </button>
    </form>
  );
}
