'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { SessionUser } from '@/types/auth';
import { Locale, translations } from '@/lib/i18n';

interface AppContextType {
  locale: Locale;
  setLocale: (loc: Locale) => void;
  t: (typeof translations)['en'];
  isRtl: boolean;
  currentUser: SessionUser | null;
  setCurrentUser: (user: SessionUser | null) => void;
  refreshUser: () => Promise<void>;
  switchDemoRole: (email: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: SessionUser | null;
}) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(initialUser || null);

  useEffect(() => {
    const saved = localStorage.getItem('salesflow_locale') as Locale;
    if (saved && (saved === 'en' || saved === 'ar')) {
      setLocaleState(saved);
      document.documentElement.dir = saved === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = saved;
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('salesflow_locale', newLocale);
    document.documentElement.dir = newLocale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLocale;
  };

  const isRtl = locale === 'ar';
  const t = translations[locale];

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
      } else {
        setCurrentUser(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const switchDemoRole = async (email: string) => {
    try {
      const res = await fetch('/api/auth/demo-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        window.location.reload();
      }
    } catch (e) {
      console.error('Failed to switch role:', e);
    }
  };

  return (
    <AppContext.Provider
      value={{
        locale,
        setLocale,
        t,
        isRtl,
        currentUser,
        setCurrentUser,
        refreshUser,
        switchDemoRole,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
