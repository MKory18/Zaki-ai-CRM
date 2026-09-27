import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { REFUSAL_AR, relyingParty, verifyRegistration } from '@/lib/passkey';

/**
 * POST /api/auth/passkey/register — finish registering a fingerprint.
 *
 * WHAT IS STORED IS PUBLIC. The browser hands over the SPKI public key
 * itself; there is no secret here and nothing to encrypt. A copy of the
 * table lets somebody verify a signature and never lets them make one.
 *
 * The challenge is spent in the same statement that finds it — two people
 * answering one challenge is exactly the race a replay is.
 */

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'غير مسجَّل الدخول' }, { status: 401 });

    const rp = relyingParty(new URL(req.url).origin);
    if (!rp) return NextResponse.json({ error: 'البصمة تحتاج اتصالاً آمناً (HTTPS)' }, { status: 400 });

    const body = await req.json().catch(() => null);
    const credentialId = typeof body?.credentialId === 'string' ? body.credentialId : '';
    const publicKey = typeof body?.publicKey === 'string' ? body.publicKey : '';
    const algorithm = Number(body?.algorithm);
    const clientDataJSON = typeof body?.clientDataJSON === 'string' ? body.clientDataJSON : '';
    const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 60) : '';

    if (!credentialId || !publicKey || !clientDataJSON || !Number.isFinite(algorithm)) {
      return NextResponse.json({ error: 'بيانات التسجيل ناقصة' }, { status: 400 });
    }

    /**
     * SPENT IN THE FINDING. `updateMany` with `usedAt: null` in the filter
     * makes a second answer to the same challenge a no-op rather than a
     * second registration — the same shape the change-request apply uses.
     */
    const now = new Date();
    const ticket = await db.passkeyChallenge.findFirst({
      where: { userId: me.id, kind: 'REGISTER', usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, challenge: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: 'انتهت صلاحية الطلب — ابدأ من جديد' }, { status: 400 });
    }
    const spent = await db.passkeyChallenge.updateMany({
      where: { id: ticket.id, usedAt: null },
      data: { usedAt: now },
    });
    if (spent.count !== 1) {
      return NextResponse.json({ error: 'انتهت صلاحية الطلب — ابدأ من جديد' }, { status: 400 });
    }

    const verdict = verifyRegistration({
      clientDataJSON,
      algorithm,
      expected: { challenge: ticket.challenge, origin: rp.origin },
    });
    if (!verdict.ok) {
      return NextResponse.json({ error: REFUSAL_AR[verdict.code], code: verdict.code }, { status: 400 });
    }

    // One physical key, one row — enforced by the unique index, so two tabs
    // racing the same finger cannot make two.
    const already = await db.passkey.findUnique({ where: { credentialId }, select: { userId: true } });
    if (already) {
      return NextResponse.json(
        {
          error:
            already.userId === me.id
              ? 'هذا المفتاح مسجَّل لديك بالفعل'
              : 'هذا المفتاح مسجَّل لحسابٍ آخر',
          code: 'ALREADY_REGISTERED',
        },
        { status: 409 }
      );
    }

    const key = await db.passkey.create({
      data: {
        userId: me.id,
        credentialId,
        publicKey,
        algorithm,
        label: label || null,
        counter: 0,
      },
      select: { id: true, label: true, createdAt: true },
    });

    await logAudit({
      companyId: me.companyId || 'platform',
      userId: me.id,
      action: 'PASSKEY_REGISTERED',
      entity: 'User',
      entityId: me.id,
      // Never the key itself. What matters on the trail is that a new way
      // in was added, by whom, and which one it is.
      newData: { passkeyId: key.id, label: key.label, algorithm },
    });

    return NextResponse.json({ key });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
