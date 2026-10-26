// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * «إضافة بحث في الاستثناءات، لما اختار يظهرلي قائمة الأشياء اللي مش بصلاحياته أصلاً… لا تنسى ميزة البحث لأني بتوه».
 * The «إضافة استثناء» dialog: a search box, and a list built for the chosen kind of exception.
 */

vi.mock('@/context/AppContext', () => ({ useApp: () => ({ currentUser: null, locale: 'ar', t: {} }) }));
vi.mock('next/navigation', () => ({ useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }));

import { PermissionPicker } from './UserDetailScreen';

afterEach(cleanup);

// The role gives the orders view and editing; the person also holds the shipping key through an exception.
const ROLE = new Set(['orders.view', 'orders.edit']);
const HOLDS = new Set(['orders.view', 'orders.edit', 'ops.ship']);
const OVERRIDES = new Set(['ops.ship']);

const draw = (effect: 'ALLOW' | 'DENY', query = '', selected = '') => {
  const onPick = vi.fn();
  render(
    <PermissionPicker
      effect={effect}
      query={query}
      onQuery={vi.fn()}
      selected={selected}
      onPick={onPick}
      has={(k) => HOLDS.has(k)}
      fromRole={(k) => ROLE.has(k)}
      hasOverride={(k) => OVERRIDES.has(k)}
    />
  );
  return onPick;
};
const listed = () => screen.queryAllByRole('option').map((o) => o.textContent ?? '');

describe('«منح» — only what the role does not give', () => {
  it('leaves out what he already has from his role', () => {
    draw('ALLOW');
    expect(listed().some((t) => t.includes('orders.view'))).toBe(false);
    expect(listed().some((t) => t.includes('finance.view'))).toBe(true);
  });

  it('a key that already has an exception stays findable, marked', () => {
    draw('ALLOW');
    const ship = screen.getAllByRole('option').find((o) => o.textContent?.includes('ops.ship'))!;
    expect(ship.textContent).toContain('عنده استثناء');
  });
});

describe('«منع» — only what he holds', () => {
  it('lists his permissions and nothing he lacks', () => {
    draw('DENY');
    const t = listed();
    expect(t.some((x) => x.includes('orders.view'))).toBe(true);
    expect(t.some((x) => x.includes('finance.view'))).toBe(false);
  });
});

describe('the search', () => {
  it('finds a permission by its Arabic name', () => {
    draw('ALLOW', 'المرتجعات');
    const t = listed();
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x) => x.includes('المرتجعات') || /returns/.test(x))).toBe(true);
  });

  it('and by its key', () => {
    draw('ALLOW', 'payroll');
    expect(listed().every((x) => x.includes('payroll'))).toBe(true);
  });

  it('NEGATIVE: nothing found says so', () => {
    draw('ALLOW', 'كلمة ما إلها صلاحية');
    expect(screen.getByText('ما في صلاحية بهالاسم.')).toBeTruthy();
  });

  it('picking one hands its key back', () => {
    const onPick = draw('ALLOW');
    fireEvent.click(screen.getAllByRole('option').find((o) => o.textContent?.includes('finance.view'))!);
    expect(onPick).toHaveBeenCalledWith('finance.view');
  });
});

describe('the words on the screen', () => {
  it('NEGATIVE: no «ALLOW»/«DENY» shown to the owner, and no broken «آ·»', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/screens/UserDetailScreen.tsx'), 'utf8');
    expect(src).not.toContain('آ·');
    // The effect values stay in the code; what is DRAWN is Arabic.
    expect(src).not.toMatch(/>\s*(ALLOW|DENY)\b/);
    expect(src).not.toMatch(/`(ALLOW|DENY) /);
  });
});
