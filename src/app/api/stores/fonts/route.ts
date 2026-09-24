import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireContext } from '@/lib/geo-context';
import { requirePermission } from '@/lib/authorization';
import { apiErrorResponse } from '@/lib/api-error';
import { logAudit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import {
  describeFont,
  fontStorageKey,
  writeFontFile,
  MAX_FONT_BYTES,
  ALLOWED_FONT_EXT,
} from '@/lib/fonts/store-fonts';
import { storeFontUrl } from '@/lib/fonts/load-store-fonts';

/**
 * THE STORE'S OWN TYPEFACES.
 *
 * A seller uploads a font file; this reads it, works out the family and the
 * weight from the bytes rather than asking, stores it under the store that
 * owns it, and hands back what the designer wrote inside it.
 *
 * That last part is the one thing here that is not ordinary. Most Arabic
 * type is licensed for the machine you design on and forbids being served
 * from a website — Boutros, BigVesta, RAOOF and thmanyah all say so, in the
 * font file itself. A seller who uploads one of those is usually not
 * defying the licence: they have never read it, because it is inside a
 * binary nobody opens.
 *
 * So the licence comes back with the upload and the panel shows it. Nothing
 * is blocked — the store is the seller's and so is the decision. It only
 * means the decision is made with the designer's words in front of them,
 * and that their answer is recorded next to the file.
 *
 * Isolation: every read and write is filtered by the caller's storeId, so a
 * font uploaded for one store cannot be listed, served or deleted from
 * another even by calling this directly.
 */

const UPLOAD_LIMIT = 40;
const UPLOAD_WINDOW_MS = 10 * 60_000;
const MAX_FILES = 10;
/** Enough for a full family at every weight, and not a font library. */
const MAX_PER_STORE = 40;

export async function GET() {
  try {
    const { companyId, storeId } = await requireContext();
    if (!storeId) return NextResponse.json({ fonts: [] });

    const rows = await db.storeFont.findMany({
      where: { companyId, storeId },
      orderBy: [{ label: 'asc' }, { weight: 'asc' }],
      select: {
        id: true, key: true, label: true, family: true, weight: true, italic: true,
        format: true, sizeBytes: true, notice: true, restricted: true, attestedAt: true,
      },
    });
    // The URL is built here, from the row. The client never assembles a
    // path to a font file — there is then no client-side path to get wrong
    // and none for a caller to bend.
    const fonts = rows.map((f) => ({ ...f, url: storeFontUrl(storeId, f) }));
    return NextResponse.json({ fonts });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { user, companyId, storeId } = await requireContext();
    await requirePermission('landing_pages.edit');
    if (!storeId) {
      return NextResponse.json({ error: 'اختر متجراً أولاً — الخط يُرفع لمتجر بعينه' }, { status: 400 });
    }

    const rl = rateLimit(`store_font_upload:${user.id}`, UPLOAD_LIMIT, UPLOAD_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `محاولات رفع كثيرة. أعد المحاولة بعد ${rl.retryAfterSec} ثانية` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'يجب رفع الملف باستخدام multipart/form-data' }, { status: 400 });
    }

    const form = await req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: 'اختر ملف خط واحداً على الأقل' }, { status: 400 });
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `الحد الأقصى ${MAX_FILES} ملفات لكل رفعة` }, { status: 400 });
    }

    // The seller's statement that they hold the right to serve these files.
    // Asked for once per upload, recorded with who and when — that is the
    // entire reason for asking. Never inferred from a previous upload.
    const attested = String(form.get('attested') || '') === 'yes';

    const existing = await db.storeFont.count({ where: { companyId, storeId } });
    if (existing + files.length > MAX_PER_STORE) {
      return NextResponse.json(
        { error: `الحد الأقصى ${MAX_PER_STORE} ملف خط لكل متجر. احذف خطاً قبل رفع غيره` },
        { status: 400 }
      );
    }

    const saved: unknown[] = [];
    for (const file of files) {
      const ext = (file.name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
      if (!ALLOWED_FONT_EXT.includes(ext as (typeof ALLOWED_FONT_EXT)[number])) {
        return NextResponse.json(
          { error: `${file.name}: الصيغ المدعومة هي ${ALLOWED_FONT_EXT.join(' ، ')}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FONT_BYTES) {
        return NextResponse.json({ error: `${file.name}: حجم الملف كبير` }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      let facts;
      try {
        facts = describeFont(buffer, file.name);
      } catch (err) {
        return NextResponse.json(
          { error: `${file.name}: ${err instanceof Error ? err.message : 'ملف غير صالح'}` },
          { status: 400 }
        );
      }

      const storageKey = fontStorageKey(companyId, storeId, facts.key, facts.weight, facts.italic, facts.format);
      await writeFontFile(storageKey, buffer);

      // Re-uploading a weight replaces it. Two rows for one weight would
      // both end up in the stylesheet and the winner would be whichever the
      // query happened to return second.
      const row = await db.storeFont.upsert({
        where: {
          companyId_storeId_key_weight_italic: {
            companyId, storeId, key: facts.key, weight: facts.weight, italic: facts.italic,
          },
        },
        create: {
          companyId, storeId, ...facts, storageKey,
          attestedBy: attested ? user.id : null,
          attestedAt: attested ? new Date() : null,
        },
        update: {
          label: facts.label, family: facts.family, format: facts.format,
          sizeBytes: facts.sizeBytes, storageKey, notice: facts.notice, restricted: facts.restricted,
          attestedBy: attested ? user.id : null,
          attestedAt: attested ? new Date() : null,
        },
        select: {
          id: true, key: true, label: true, family: true, weight: true, italic: true,
          format: true, sizeBytes: true, notice: true, restricted: true, attestedAt: true,
        },
      });
      saved.push({ ...row, url: storeFontUrl(storeId, row) });
    }

    await logAudit({
      companyId,
      userId: user.id,
      action: 'STORE_FONT_UPLOADED',
      entity: 'StoreFont',
      entityId: storeId,
      // Names and licence status, never the bytes and never the notice text.
      newData: { count: saved.length, attested },
    });

    return NextResponse.json({ success: true, fonts: saved });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
