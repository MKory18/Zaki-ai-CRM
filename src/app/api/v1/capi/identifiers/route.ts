import { z } from 'zod';
import { requireSystemToken } from '@/lib/v1/system-token';
import { V1_CODE, V1Fault, requestIdOf, v1ErrorResponse, v1Ok } from '@/lib/v1/door';
import { MAX_REFS, readCapiIdentifiers } from '@/lib/v1/capi-identifiers';

/**
 * POST /api/v1/capi/identifiers   { "refs": ["enc:…", …] }
 *
 * THE ONLY ANSWER AT THIS DOOR THAT CARRIES A CUSTOMER — which is why it has
 * its own scope (`capi.identifiers`), is in no system's default set, and is
 * the one route here that is a POST for a read.
 *
 * It exists for one job: the media buyer's server-side conversions to Meta.
 * `GET /orders/attribution` hands out an opaque `capi_ref` per order; this
 * opens the references, in memory, and answers `{ items: [{ ref, phone_e164,
 * fbc, fbp, … }] }`. Rules, each held by `capi-identifiers.test.ts`:
 *
 *   · POST, so a reference never sits in a URL, an access log or a referrer.
 *   · `Cache-Control: no-store` — nothing between here and the caller keeps it.
 *   · NOTHING is logged: not a reference, not a value, not the body. The
 *     request id is the only thing a log line may hold.
 *   · Decrypted per call and dropped; nothing is written, cached or counted.
 *   · The company is the token's. A reference minted for another company
 *     opens for nobody here, and looks like any other that does not open.
 *   · At most `MAX_REFS` references per call; a reference that does not open
 *     is absent from the answer, not an error that names it.
 */

const Body = z.object({ refs: z.array(z.string().min(1).max(1024)).min(1).max(MAX_REFS) }).strict();

export async function POST(req: Request) {
  const requestId = requestIdOf(req);
  try {
    const caller = await requireSystemToken(req, 'capi.identifiers');

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new V1Fault(422, V1_CODE.VALIDATION_FAILED, 'The body is not valid JSON');
    }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      // The field, and never the value that broke it.
      throw new V1Fault(422, V1_CODE.VALIDATION_FAILED, `Body must be { "refs": [1..${MAX_REFS} strings] }`, {
        field: 'refs',
        max: MAX_REFS,
      });
    }

    const items = await readCapiIdentifiers(caller.companyId, parsed.data.refs);
    return v1Ok(requestId, { items }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    return v1ErrorResponse(requestId, error);
  }
}
