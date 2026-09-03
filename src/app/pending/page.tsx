'use client';

import React, { useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { PendingScreen } from '@/components/layout/AppLayout';

export default function PendingPage() {
  const { currentUser, refreshUser } = useApp();

  useEffect(() => {
    if (!currentUser) {
      window.location.href = '/login';
    }
  }, [currentUser]);

  if (!currentUser) return null;
  return <PendingScreen />;
}
