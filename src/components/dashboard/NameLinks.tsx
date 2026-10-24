'use client';

import React from 'react';
import Link from 'next/link';
import { useMayOpen } from '@/hooks/useMayOpen';

/**
 * A NAME ON THE DASHBOARD THAT OPENS WHAT IT NAMES.
 *
 * «الأكثر طلباً: كريم الشعر» and «١ — سامر» were text. The person reading them wants the
 * product, or the person, and went to another menu line and searched for the name the
 * dashboard had just said. These are the same words, as a link.
 *
 * They link to the RECORD, not to a filtered list on purpose. A list's length would be
 * all-time while the card's number is for the period chosen above it, and a link that
 * lands on a different count than the one it was pressed on is a worse failure than no link
 * (the rule the palette's counts were written with). The record has no number to disagree.
 *
 * Drawn as a link only to whoever may open the screen behind it (`useMayOpen`, the sidebar's
 * own question) and only when there is a real id; otherwise exactly the text it always was.
 */

const LINK = 'hover:underline hover:text-[var(--sys-primary)]';

export function ProductNameLink({ id, name, className = '' }: { id?: string | null; name: string; className?: string }) {
  const mayOpen = useMayOpen();
  if (!id || !mayOpen('/products')) return <span className={className}>{name}</span>;
  return (
    <Link href={`/products/${id}`} className={`${className} ${LINK}`}>
      {name}
    </Link>
  );
}

export function PersonNameLink({ id, name, className = '' }: { id?: string | null; name: string; className?: string }) {
  const mayOpen = useMayOpen();
  if (!id || !mayOpen('/admin/users')) return <span className={className}>{name}</span>;
  return (
    <Link href={`/admin/users/${id}`} className={`${className} ${LINK}`}>
      {name}
    </Link>
  );
}
