import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';
import {
  LaunchFlagRefused,
  launchFlagReport,
  overdueFlags,
  setLaunchFlag,
} from '@/lib/launch-flags';

/**
 * GET/PUT /api/settings/launch-flags — بوابةُ الإطلاق، مقروءةً ومقلوبة.
 *
 * WHY THIS ROUTE EXISTS AT ALL.
 *
 * The registry decided to keep flag STATE in the database (see the long
 * note at the top of `lib/launch-flags.ts`), and the reason it is allowed
 * to live there rather than in an env var is that a database write goes
 * through a permission and leaves an audit row. Without this route that is
 * a claim: the state would sit in a column nobody could reach, which is a
 * code constant with extra steps. So the route is not a convenience — it is
 * the half of the decision that makes the decision true.
 *
 * It follows `api/settings/performance/route.ts` line for line, because
 * that is the house pattern for a settings module: `settings.view` to read,
 * the edit permission to write, the parse and the refusals in the lib, and
 * `logAudit` with `previousData` and `newData` so «who turned the ads agent
 * on» has an answer that is not somebody's memory.
 *
 * WHAT IT DELIBERATELY CANNOT DO.
 *
 * It cannot change a flag's OWNER, its REVIEW DATE or its KIND. Those are
 * declared in code, and a screen that could edit them would undo the whole
 * point: an owner that can be reassigned from a form is not accountable,
 * and an `UNBUILT` flag that a screen can promote to a working switch is
 * exactly the green tick beside a feature nobody wrote. Those three are
 * changed in a diff, with a name on it.
 *
 * And it cannot write a key whose kind is not `SWITCH` — the lib refuses,
 * not this file. The refusal is in the service layer on purpose (rule 4):
 * a second door added later, or a script, or a job, meets the same wall.
 */

const schema = z.object({ key: z.string().min(1).max(64), on: z.boolean() });

export async function GET() {
  try {
    const { companyId } = await requireContext();
    await requirePermission('settings.view');

    const flags = await launchFlagReport(companyId);
    return NextResponse.json({
      flags,
      /*
       * المتأخّر مُفرَزٌ مرّةً أخرى هنا، لا كي تحسبه الشاشة.
       *
       * The frontend rule of this codebase: the UI computes nothing the
       * backend already computes. `overdue` is on each row and the list is
       * beside it, so a screen shows a banner by reading a length — it never
       * compares a date, and the two can therefore never disagree.
       */
      overdue: overdueFlags(flags).map((f) => f.key),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, companyId } = await requireContext();
    await requirePermission('settings.edit');

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
    }

    const before = await launchFlagReport(companyId);
    const was = before.find((f) => f.key === parsed.data.key);

    let saved;
    try {
      saved = await setLaunchFlag(companyId, parsed.data.key, parsed.data.on);
    } catch (e) {
      /*
       * A refusal is the normal, expected answer here — «that key is not a
       * switch», «it is frozen until the 16th», «its review date has
       * passed» — so it comes back as a 409 with the sentence the registry
       * wrote. Left to `apiErrorResponse` it would be a 500 and the reason
       * would be swallowed, because `apiError` only recognises the shapes
       * this codebase already throws.
       */
      if (e instanceof LaunchFlagRefused) {
        return NextResponse.json({ error: e.message, errorAr: e.ar, code: 'LAUNCH_FLAG_REFUSED' }, { status: 409 });
      }
      throw e;
    }

    /*
     * The audit row carries the STATE, not the boolean that was posted. The
     * two differ exactly when the registry overrode the request — a flip
     * held by the 14-day freeze, say — and the log must record what the
     * system ended up believing rather than what somebody asked for.
     */
    await logAudit({
      companyId,
      userId: user.id,
      action: 'LAUNCH_FLAG_SET',
      entity: 'Company',
      entityId: companyId,
      previousData: was ? { key: was.key, state: was.state, owner: was.owner, reviewOn: was.reviewOn } : null,
      newData: { key: saved.key, state: saved.state, owner: saved.owner, reviewOn: saved.reviewOn },
    });

    return NextResponse.json({ flag: saved });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
