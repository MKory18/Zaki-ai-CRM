import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrorResponse } from '@/lib/api-error';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { can } from '@/lib/authorization';
import { parseLayout } from '@/lib/nav-arrangement';
import { readArrangement, readRoleArrangement, saveRoleArrangement } from '@/lib/nav-arrangement-store';
import { logAudit } from '@/lib/audit';

/**
 * VIEWS THE OWNER PUBLISHES TO A ROLE.
 *
 * «المتأخرة أكثر من عشرة أيام، أرامكس، إربد» is what somebody opens the
 * orders screen to see every morning, and setting it costs six controls
 * before any work starts. A person's own views already live in their
 * browser (`src/components/ui/SavedViews.tsx`). This is the other half the
 * owner asked for: a view HE publishes to a role, so a new agent's first
 * morning already has the question their job is about.
 *
 * ── A VIEW CANNOT WIDEN WHAT A ROLE SEES ──
 *
 * It is a NAME and a QUERY STRING. Applying one re-asks the question
 * through `GET /api/orders`, which applies the same visibility envelope it
 * always has (`applyQueueFilter`, per role, per scope). So the most a
 * published view can do is ask for rows the server then refuses to return
 * — and the role sees exactly what it saw before, arranged.
 *
 * Nothing about any customer is stored: no results, no counts, no record
 * ids, nothing that could still be true after the data has moved on.
 */

const SURFACE = (screen: string) => `view:${screen.replace(/[^a-z-]/g, '').slice(0, 24)}`;

const bodySchema = z.object({
  screen: z.string().min(2).max(24),
  roleId: z.string().uuid(),
  views: z
    .array(z.object({ name: z.string().trim().min(1).max(40), query: z.string().max(500) }))
    .max(12),
});

/** GET ?screen=orders — the views published to the caller's own role. */
export async function GET(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    const screen = new URL(req.url).searchParams.get('screen') ?? 'orders';
    const { base } = await readArrangement(companyId, user.id, user.role, SURFACE(screen));
    return NextResponse.json({
      /** Read-only on the screen: the owner's, not this person's. */
      published: base?.views ?? [],
      mayPublish: can(user, 'roles.edit'),
    });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

/** PUT — replace what is published to a role. */
export async function PUT(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    if (!can(user, 'roles.edit')) {
      return NextResponse.json(
        { errorAr: 'نشر عرضٍ لدورٍ كامل بيحتاج صلاحيّة تعديل الأدوار.', code: 'PUBLISH_FORBIDDEN' },
        { status: 403 }
      );
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ errorAr: 'شكل العرض غير مفهوم.' }, { status: 400 });
    }

    /*
     * The role has to be this company's (or a system template). Without
     * this a role id from another company would be written against this
     * company's row and belong to nobody.
     */
    const role = await db.role.findFirst({
      where: { id: parsed.data.roleId, OR: [{ companyId }, { companyId: null }] },
      select: { id: true, name: true },
    });
    if (!role) return NextResponse.json({ errorAr: 'لا دور بهذا المعرّف.' }, { status: 404 });

    const surface = SURFACE(parsed.data.screen);
    // Through `parseLayout` so what is stored is the same shape the reader
    // expects, with the same caps on it.
    const layout = parseLayout({ order: [], hidden: [], pinned: [], views: parsed.data.views });
    await saveRoleArrangement(companyId, role.id, layout, surface);
    await logAudit({
      companyId,
      userId: user.id,
      action: 'VIEWS_PUBLISHED',
      entity: 'Role',
      entityId: role.id,
      // The NAMES, never the queries: a filter is not a secret, but an
      // audit row is not the place for a query string either.
      newData: { role: role.name, screen: parsed.data.screen, views: parsed.data.views.map((v) => v.name) },
    });
    return NextResponse.json({ published: layout.views ?? [], role: role.name });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}

/** POST ?roleId=&screen= — what a role has published today, for the editor. */
export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    if (!can(user, 'roles.edit')) {
      return NextResponse.json({ errorAr: 'لا تملك صلاحية تعديل الأدوار.' }, { status: 403 });
    }
    const url = new URL(req.url);
    const roleId = url.searchParams.get('roleId');
    const screen = url.searchParams.get('screen') ?? 'orders';
    if (!roleId) return NextResponse.json({ errorAr: 'المعرّف مطلوب.' }, { status: 400 });
    const role = await db.role.findFirst({
      where: { id: roleId, OR: [{ companyId }, { companyId: null }] },
      select: { id: true, name: true },
    });
    if (!role) return NextResponse.json({ errorAr: 'لا دور بهذا المعرّف.' }, { status: 404 });
    const layout = await readRoleArrangement(companyId, role.id, SURFACE(screen));
    return NextResponse.json({ role: role.name, published: layout.views ?? [] });
  } catch (error: unknown) {
    return apiErrorResponse(error);
  }
}
