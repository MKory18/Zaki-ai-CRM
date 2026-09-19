'use client';

import React, { createContext, useContext, useState } from 'react';
import { SessionUser } from '@/types/auth';
import { translations } from '@/lib/i18n';

/**
 * App-wide client context. The interface is Arabic RTL only (contract
 * PART 7) — `locale` and `isRtl` are constants kept so screens that still
 * read them keep compiling until each is rebuilt in its own stage.
 */

interface AppContextType {
  locale: 'ar';
  t: (typeof translations)['ar'];
  isRtl: true;
  currentUser: SessionUser | null;
  setCurrentUser: (user: SessionUser | null) => void;
  refreshUser: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: SessionUser | null;
}) {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(initialUser || null);

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      setCurrentUser(res.ok ? (await res.json()).user : null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AppContext.Provider
      value={{
        locale: 'ar',
        t: translations.ar,
        isRtl: true,
        currentUser,
        setCurrentUser,
        refreshUser,
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
