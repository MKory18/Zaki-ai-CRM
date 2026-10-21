'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useMayOpen } from '@/hooks/useMayOpen';
import { routeLabel } from '@/lib/route-registry';
import { SETTINGS_CARDS } from '@/lib/settings-home';
import { connectNotice } from '@/lib/ad-connect-outcome';

/**
 * /settings — the one menu line that stands for twelve screens.
 *
 * The sidebar lists «الإعدادات» once, and this is what it opens: a card for
 * each thing that can be configured, and under it the screens that belong to
 * it. See `settings-home.ts` for the cards, and `NavGroup.hub` for why a page
 * of cards and not a strip of twelve pills above every settings screen.
 *
 * It is also where an ad platform sends somebody back to. The OAuth callback
 * has always redirected to `/settings?connect=…` — to a page that did not
 * exist — so connecting an account ended on a 404 whether it worked or not.
 * The outcome is read ONCE, from the address, and said in a sentence; the
 * link beside it leads to where the accounts are.
 */
export function SettingsHomeScreen() {
  const mayOpen = useMayOpen();
  const asked = useSearchParams();
  const notice = connectNotice(asked.get('connect'), asked.get('platform'), asked.get('count'));

  const cards = SETTINGS_CARDS.map((card) => ({
    ...card,
    open: card.paths.filter((path) => mayOpen(path)),
  })).filter((card) => card.open.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="الإعدادات" description="كل ما يضبط كيف يشتغل النظام. اختر البطاقة، وافتح منها الشاشة." />

      {notice && (
        <div
          role="status"
          className={
            notice.tone === 'good'
              ? 'rounded-lg border border-[var(--sys-border)] bg-[var(--sys-card)] px-3 py-2.5 text-xs text-[var(--sys-success)]'
              : 'rounded-lg border border-[var(--sys-destructive-border)] bg-[var(--sys-destructive-soft)] px-3 py-2.5 text-xs text-[var(--sys-destructive)]'
          }
        >
          {notice.text}{' '}
          {mayOpen('/settings/tracking') && (
            <Link href="/settings/tracking" className="font-semibold underline">
              {routeLabel('/settings/tracking')}
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardContent className="space-y-2">
              <h2 className="text-sm font-semibold text-[var(--sys-heading)]">{card.title}</h2>
              <p className="text-xs leading-relaxed text-[var(--sys-muted-foreground)]">{card.why}</p>
              <ul className="space-y-1 pt-1">
                {card.open.map((path) => (
                  <li key={path}>
                    <Link href={path} className="text-xs font-medium text-[var(--sys-primary)] hover:underline">
                      {routeLabel(path)}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
