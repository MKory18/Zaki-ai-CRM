import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireCompanyTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';
import {
  REPLIES_SCOPES,
  TOKEN_DAYS,
  V1_SCOPES,
  V1_SCOPE_AR,
  mintToken,
  parseScopes,
} from '@/lib/v1/system-token';

/**
 * «توكنات الأنظمة» — the keys other systems call `/api/v1` with.
 *
 *   GET    — the list: name, system, prefix, scopes, last used, state
 *   POST    — create one. The token is in THIS response and nowhere else.
 *   DELETE — stop one immediately. Never deletes the row.
 *
 * ── THE TOKEN IS SHOWN ONCE ──
 *
 * `GET` cannot return it and neither can anything else: only the SHA-256 is
 * stored, so there is nothing to return. That is the same discipline
 * `/api/apps` follows for an app's signing secret — «Never `secret`. An
 * endpoint that can return it will one day return it to the wrong person.»
 * If the owner loses it, he makes a new one and stops the old one.
 *
 * ── AND STOPPING IS NOT DELETING ──
 *
 * `revokedAt` is set and the row stays. Who opened a door and who shut it
 * survives the shutting — the same reversal-only discipline a released
 * block and a reversed financial entry follow. A deleted row would leave
 * nothing to explain a key that used to work.
 *
 * `apps.manage` is the authority, not a new permission: «الإعدادات ←
 * التطبيقات ← «توكنات الأنظمة»» is where the screen lives, and the
 * catalogue already says what `apps.manage` is for — «Installing an app
 * connects the company to something outside it, and registering one hands
 * out a signing secret.» Handing out a system key is the same act.
 */

const createSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(60),
  system: z.string().trim().min(2).max(40).default('replies'),
  scopes: z.array(z.enum(V1_SCOPES)).min(1, 'اختر صلاحية واحدة على الأقل'),
  rateLimitPerMin: z.number().int().min(1).max(600).default(60),
  days: z.number().int().min(1).max(365).default(TOKEN_DAYS),
});

const revokeSchema = z.object({ id: z.string().uuid() });

export async function GET() {
  try {
    const { companyId } = await requireCompanyTenant();
    await requirePermission('apps.manage');

    const rows = await db.systemToken.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      // `tokenHash` is NOT selected. It is not the secret, but it is the
      // thing a stolen copy would be compared against, and no screen needs
      // it — the same reason `/api/apps` never selects `secret`.
      select: {
        id: true,
        name: true,
        system: true,
        prefix: true,
        scopes: true,
        rateLimitPerMin: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    const now = Date.now();
    return NextResponse.json({
      // What the screen offers, from the one list that defines them, so a new
      // scope never has to be typed into a component as well.
      scopeCatalog: V1_SCOPES.map((key) => ({ key, ar: V1_SCOPE_AR[key] })),
      repliesScopes: REPLIES_SCOPES,
      defaultDays: TOKEN_DAYS,
      tokens: rows.map((t) => ({
        id: t.id,
        name: t.name,
        system: t.system,
        prefix: t.prefix,
        scopes: parseScopes(t.scopes),
        rateLimitPerMin: t.rateLimitPerMin,
        expiresAt: t.expiresAt,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
        // One word a person can act on, computed here rather than in the
        // browser: «موقوف» is a decision somebody made and «منتهي» is the
        // clock, and the two need different buttons.
        state:
          t.revokedAt !== null
            ? 'REVOKED'
            : t.expiresAt !== null && t.expiresAt.getTime() <= now
              ? 'EXPIRED'
              : 'ACTIVE',
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('apps.manage');

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }
    const v = parsed.data;

    const minted = mintToken();
    const expiresAt = new Date(Date.now() + v.days * 24 * 60 * 60 * 1000);

    const row = await db.systemToken.create({
      data: {
        companyId,
        name: v.name,
        system: v.system,
        tokenHash: minted.tokenHash,
        prefix: minted.prefix,
        scopes: JSON.stringify(v.scopes),
        rateLimitPerMin: v.rateLimitPerMin,
        expiresAt,
        createdById: user.id,
      },
      select: { id: true, name: true, system: true, prefix: true, expiresAt: true, createdAt: true },
    });

    // The audit records that a key was issued, to whom, and with what — and
    // not the key. `logAudit` redacts any field whose name matches /token/i
    // anyway; the prefix is what a person recognises it by.
    await logAudit({
      companyId,
      userId: user.id,
      action: 'SYSTEM_TOKEN_CREATED',
      entity: 'SystemToken',
      entityId: row.id,
      newData: { name: v.name, system: v.system, prefix: minted.prefix, scopes: v.scopes, expiresAt },
    });

    return NextResponse.json(
      {
        token: { ...row, scopes: v.scopes, rateLimitPerMin: v.rateLimitPerMin, state: 'ACTIVE' },
        // ── THE ONE AND ONLY TIME THIS VALUE EXISTS OUTSIDE A HEADER ──
        // It is not stored, not logged and not returned by GET. The screen
        // says so beside it, because a person who closes the box without
        // copying it has to make a new one.
        secret: minted.token,
        notice: 'انسخ المفتاح الآن — لن يظهر مرة أخرى. إن فُقد، أوقف هذا المفتاح وأنشئ غيره.',
      },
      { status: 201 }
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { user, companyId } = await requireCompanyTenant();
    await requirePermission('apps.manage');

    const parsed = revokeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    // Scoped to the company, so one company cannot stop another's key. The
    // row is never removed — see the header.
    const stopped = await db.systemToken.updateMany({
      where: { id: parsed.data.id, companyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (stopped.count === 0) {
      return NextResponse.json(
        { error: 'المفتاح غير موجود أو موقوف مسبقاً', errorAr: 'المفتاح غير موجود أو موقوف مسبقاً. أعد تحميل الصفحة.' },
        { status: 404 }
      );
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'SYSTEM_TOKEN_REVOKED',
      entity: 'SystemToken',
      entityId: parsed.data.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
