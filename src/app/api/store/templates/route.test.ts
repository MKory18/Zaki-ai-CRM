import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * INSTALLING A TEMPLATE WRITES THE DRAFT, NEVER WHAT IS LIVE.
 *
 * A template is a starting point: the seller must be able to try one, look
 * at it and walk away. If installing touched the live page, "try one" would
 * mean "show every customer something you have not seen".
 */

const { db, requireContext, requirePermission, logAudit } = vi.hoisted(() => ({
  db: { store: { findFirst: vi.fn(), update: vi.fn() } },
  requireContext: vi.fn(),
  requirePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/geo-context', () => ({ requireContext: (...a: unknown[]) => requireContext(...a) }));
vi.mock('@/lib/authorization', () => ({ requirePermission: (...a: unknown[]) => requirePermission(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

import { GET, POST } from './route';
import { PAGE_TEMPLATES } from '@/lib/page-templates';
import { DEFAULT_STORE_THEME } from '@/lib/store-theme';
import { TEMPLATE_FILE_KIND } from '@/lib/store-template-file';

const STORE = {
  id: 's1', name: 'صحة بلس', type: 'MULTI_PRODUCT',
  theme: JSON.stringify({ ...DEFAULT_STORE_THEME, footer: { copyright: '© صحة بلس' } }),
  homeDraft: null as string | null,
};

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/store/templates', { method: 'POST', body: JSON.stringify(body) }));
const get = (url = 'http://localhost/api/store/templates') => GET(new Request(url));

beforeEach(() => {
  vi.resetAllMocks();
  requireContext.mockResolvedValue({ user: { id: 'u1' }, companyId: 'c1', storeId: 's1' });
  requirePermission.mockResolvedValue(undefined);
  db.store.findFirst.mockResolvedValue({ ...STORE });
  db.store.update.mockResolvedValue({});
});

describe('installing from the gallery', () => {
  it('writes the draft, and ONLY the draft', async () => {
    // stores.theme is what every live storefront page and every published
    // landing page renders from. Writing it here would repaint the whole
    // shop the instant a seller pressed "try this one" — while the screen
    // told them it was a draft.
    const res = await post({ source: 'builtin', key: PAGE_TEMPLATES[0].key });
    expect(res.status).toBe(200);
    const data = db.store.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['homeDraft']);
    expect(JSON.parse(data.homeDraft).length).toBeGreaterThan(0);
  });

  it('hands the palette back as a proposal, and says it is not applied', async () => {
    const body = await (await post({ source: 'builtin', key: PAGE_TEMPLATES[0].key })).json();
    expect(body.themeApplied).toBe(false);
    expect(body.theme.accent).toBeTruthy();
  });

  it('and that proposal keeps the shop settings the template has no opinion about', async () => {
    // A template is a look. It must not empty the footer's copyright, the
    // header height or the checkout wording the seller set.
    const body = await (await post({ source: 'builtin', key: PAGE_TEMPLATES[0].key })).json();
    expect(body.theme.footer.copyright).toBe('© صحة بلس');
  });

  it('refuses a key it does not know, rather than installing something else', async () => {
    // buildTemplate falls back to its last entry for an unknown key, which
    // would quietly install a template nobody picked.
    const res = await post({ source: 'builtin', key: 'no-such-template' });
    expect(res.status).toBe(404);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('installing from a file', () => {
  const file = {
    kind: TEMPLATE_FILE_KIND,
    version: 1,
    name: 'قالب صديقي',
    theme: DEFAULT_STORE_THEME,
    sections: [
      { id: 'h1', type: 'hero', enabled: true, headline: 'مرحباً', subheadline: '', showPrice: false, ctaText: 'اطلب',
        image: '/api/media/companies/OTHER/products/x/y.webp' },
    ],
  };

  it('goes through, and the other company’s image does not come with it', async () => {
    const res = await post({ source: 'file', file });
    expect(res.status).toBe(200);
    const written = db.store.update.mock.calls[0][0].data.homeDraft;
    expect(written).not.toContain('/api/media/');
    expect(written).toContain('مرحباً');
    expect(Object.keys(db.store.update.mock.calls[0][0].data)).toEqual(['homeDraft']);
  });

  it('a file that is not one is refused, and nothing is written', async () => {
    for (const bad of [{ kind: 'other' }, 'garbage', null, { kind: TEMPLATE_FILE_KIND, version: 99 }]) {
      const res = await post({ source: 'file', file: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('a file carrying a block type the system does not have is refused', async () => {
    const res = await post({
      source: 'file',
      file: { ...file, sections: [{ id: 'x', type: 'run-my-code', enabled: true }] },
    });
    expect(res.status).toBe(400);
    expect(db.store.update).not.toHaveBeenCalled();
  });
});

describe('exporting', () => {
  it('hands back a file named after the shop, as a download', async () => {
    const res = await get('http://localhost/api/store/templates?export=1');
    expect(res.headers.get('content-disposition')).toContain('.zaki-template.json');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('carries the shape but not the shop’s images', async () => {
    db.store.findFirst.mockResolvedValue({
      ...STORE,
      homeDraft: JSON.stringify([
        { id: 'h1', type: 'hero', enabled: true, headline: 'عنوان', subheadline: '', showPrice: false,
          ctaText: 'اطلب', image: '/api/media/companies/c1/products/p1/x.webp' },
      ]),
    });
    const body = await (await get('http://localhost/api/store/templates?export=1')).text();
    expect(body).toContain('عنوان');
    expect(body).not.toContain('/api/media/');
  });
});

describe('the guards', () => {
  it('reading is storefront.view, installing is storefront.manage', async () => {
    await get();
    expect(requirePermission).toHaveBeenCalledWith('storefront.view');
    vi.clearAllMocks();
    requirePermission.mockResolvedValue(undefined);
    db.store.findFirst.mockResolvedValue({ ...STORE });
    db.store.update.mockResolvedValue({});
    await post({ source: 'builtin', key: PAGE_TEMPLATES[0].key });
    expect(requirePermission).toHaveBeenCalledWith('storefront.manage');
  });

  it('installing needs no publish permission — nothing reaches a customer', async () => {
    await post({ source: 'builtin', key: PAGE_TEMPLATES[0].key });
    expect(requirePermission).not.toHaveBeenCalledWith('storefront.publish');
  });

  it('a Single Product store is refused at the server, not by a hidden button', async () => {
    db.store.findFirst.mockResolvedValue({ ...STORE, type: 'SINGLE_PRODUCT' });
    const res = await post({ source: 'builtin', key: PAGE_TEMPLATES[0].key });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SINGLE_PRODUCT');
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('another company’s store reads as missing', async () => {
    db.store.findFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    expect((await post({ source: 'builtin', key: PAGE_TEMPLATES[0].key })).status).toBe(404);
  });

  it('the gallery lists every template, with something to choose by', async () => {
    const body = await (await get()).json();
    expect(body.templates).toHaveLength(PAGE_TEMPLATES.length);
    for (const t of body.templates) {
      expect(t.label.length).toBeGreaterThan(1);
      expect(t.hint.length).toBeGreaterThan(5);
      expect(t.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
