// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ORDER FORM SAYS HOW LONG IT WILL TAKE — AND SAYS NOTHING WHEN IT
 * DOES NOT KNOW.
 *
 * This replaces a text match. `delivery-time.test.ts` asserted that
 * `CreateOrderModal.tsx` CONTAINS the string `selectedRegion?.deliveryAr &&`
 * — a guard on a spelling, not on a rule. It fired the moment the condition
 * was rewritten to prefer the finer answer, although the rewritten form
 * hides the sentence in exactly the same cases; and it would have passed on
 * a condition that mentioned `deliveryAr` and then printed a hard-coded
 * «يومين» beside it.
 *
 * So the rule is asserted by RENDERING the form:
 *
 *   nothing measured            → no sentence at all
 *   the governorate measured    → the governorate's words, «لهذه المحافظة»
 *   the address measured        → the ADDRESS's words win, «لهذا العنوان»
 *
 * The arithmetic is not re-checked here — `a-street-is-not-a-governorate`
 * owns that. What is checked is that the screen shows what the engine
 * returned and invents nothing when it returned nothing.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { regions, eta, products, apiFetch } = vi.hoisted(() => ({
  regions: { current: null as any },
  eta: { current: null as any },
  products: { current: null as any },
  apiFetch: vi.fn(),
}));

vi.mock('@/hooks/useRegions', () => ({ useRegions: () => regions.current }));
vi.mock('@/hooks/useDeliveryEta', () => ({ useDeliveryEta: () => eta.current }));
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => products.current }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  apiJson: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({ t: (k: string) => k, locale: 'ar', isRtl: true }),
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: vi.fn(), error: vi.fn(), success: vi.fn() }) }));

import { CreateOrderModal } from './CreateOrderModal';

const AMMAN = { id: 'r-amman', name: 'عمّان' };

/** The regions hook, with or without a measured window on عمّان. */
const withRegion = (delivery: { medianDays: number; slowDays: number; samples: number } | null) => ({
  regions: [
    {
      ...AMMAN,
      delivery,
      deliveryAr: delivery ? `يصل عادةً خلال ${delivery.medianDays} أيام` : null,
    },
  ],
  countryName: 'الأردن',
  currency: { code: 'JOD', minorUnit: 3 },
  loading: false,
});

/** Pick عمّان in the governorate select, which is what the seller does. */
function pickAmman() {
  const select = screen.getByLabelText('المحافظة') as HTMLSelectElement;
  select.value = AMMAN.id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  products.current = { products: [], loading: false };
  eta.current = { eta: null, loading: false };
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ users: [] }) });
});
afterEach(cleanup);

const open = () => render(<CreateOrderModal isOpen onClose={() => {}} onSuccess={() => {}} />);

describe('the sentence appears only where it was measured', () => {
  it('says nothing when the shop has not learned this governorate yet', () => {
    regions.current = withRegion(null);
    open();
    pickAmman();
    expect(screen.queryByText(/يصل عادةً/), 'وعدٌ من لا شيء').toBeNull();
    expect(screen.queryByText(/تسليماً سابقاً/)).toBeNull();
  });

  it('says the governorate when only the governorate is known', () => {
    regions.current = withRegion({ medianDays: 3, slowDays: 5, samples: 12 });
    open();
    pickAmman();
    expect(screen.getByText(/يصل عادةً خلال 3/)).toBeTruthy();
    expect(screen.getByText(/لهذه المحافظة/), 'لم يَقُل من أيِّ حَبّةٍ جاء الرقم').toBeTruthy();
    expect(screen.getByText(/12 تسليماً سابقاً/)).toBeTruthy();
  });

  it('and the ADDRESS wins over the governorate once it is known', () => {
    /*
     * The governorate says three days from twelve deliveries; this street
     * says one day from seven. The seller on the phone must be told one.
     */
    regions.current = withRegion({ medianDays: 3, slowDays: 5, samples: 12 });
    eta.current = {
      eta: {
        window: { medianDays: 1, slowDays: 1, samples: 7 },
        ar: 'يصل عادةً خلال يوم',
        level: 'address',
        levelAr: 'لهذا العنوان',
        reason: null,
      },
      loading: false,
    };
    open();
    pickAmman();
    expect(screen.getByText(/يصل عادةً خلال يوم/)).toBeTruthy();
    expect(screen.getByText(/لهذا العنوان/), 'قال المحافظةَ وهو يَعرفُ الشارع').toBeTruthy();
    expect(screen.getByText(/7 تسليماً سابقاً/), 'عدَّ تسليماتِ المحافظةِ لا الشارع').toBeTruthy();
    expect(screen.queryByText(/خلال 3/), 'رقمُ المحافظةِ ما زال ظاهراً').toBeNull();
  });

  it('and an ETA that knows nothing does not erase what the governorate knew', () => {
    // The address has not been typed yet, so the finer door answers null.
    // The governorate's sentence must survive that.
    regions.current = withRegion({ medianDays: 3, slowDays: 5, samples: 12 });
    eta.current = { eta: { window: null, ar: null, level: null, levelAr: null, reason: 'لا توجد تسليمات' }, loading: false };
    open();
    pickAmman();
    expect(screen.getByText(/يصل عادةً خلال 3/), 'الجملةُ اختفت لأنّ العنوانَ لم يُكتَب').toBeTruthy();
  });

  it('and nothing is said before a governorate is picked at all', () => {
    regions.current = withRegion({ medianDays: 3, slowDays: 5, samples: 12 });
    open();
    expect(screen.queryByText(/يصل عادةً/)).toBeNull();
  });
});
