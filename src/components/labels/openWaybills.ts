'use client';

/**
 * OPENING THE WAYBILLS, FROM ANY SCREEN.
 *
 * The orders list and the shipping batches both print waybills, and both
 * had their own copy of "ask for a token, then open it". Two things were
 * wrong with both copies.
 *
 *   The tab was opened AFTER the request came back. A browser only lets a
 *   page open a tab inside the click itself; after an await, Safari and iOS
 *   treat it as a pop-up and block it, so on a phone the button did nothing.
 *   The tab is now opened in the click and pointed at the sheet once it is
 *   ready — or closed again if nothing could be printed.
 *
 *   Orders that could not be printed vanished without a word. The server
 *   now names them and why, and this hands that back to the screen.
 */

export interface WaybillRequest {
  orderIds?: string[];
  batchId?: string;
  width: number;
  height: number;
  sheetWidth?: number;
  sheetHeight?: number;
}

export interface WaybillOutcome {
  count: number;
  refused: { orderNumber: string; reason: string }[];
}

export class WaybillError extends Error {
  constructor(message: string, readonly refused: { orderNumber: string; reason: string }[] = []) {
    super(message);
    this.name = 'WaybillError';
  }
}

/**
 * print — the sheet, which commits each label when it is actually printed.
 * pdf   — the same sheet for "Save as PDF"; saving commits nothing.
 * csv   — the courier's bulk-upload file.
 */
export async function openWaybills(req: WaybillRequest, mode: 'print' | 'pdf' | 'csv'): Promise<WaybillOutcome> {
  // Inside the click, before any await — the only moment a tab may open.
  const tab = mode === 'csv' ? null : window.open('', '_blank');
  if (tab) {
    tab.document.write(
      '<p dir="rtl" style="font-family:Tahoma,Arial,sans-serif;padding:24px;color:#364152">جارٍ تجهيز البوالص…</p>'
    );
  }

  try {
    const res = await fetch('/api/ops/labels', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new WaybillError(data.errorAr || data.error || 'تعذر تجهيز البوالص', data.refused ?? []);
    }

    const path: string = mode === 'pdf' ? data.pdfPath : mode === 'csv' ? `${data.printPath}&format=csv` : data.printPath;

    if (mode === 'csv') {
      // A download is not a pop-up, so it may start after the await.
      const a = document.createElement('a');
      a.href = path;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (tab) {
      tab.location.href = path;
    } else {
      // The browser refused even the in-click tab; this one it may allow.
      window.open(path, '_blank');
    }

    return { count: data.count ?? 0, refused: data.refused ?? [] };
  } catch (e) {
    tab?.close();
    throw e instanceof WaybillError ? e : new WaybillError(e instanceof Error ? e.message : 'تعذر تجهيز البوالص');
  }
}

/** "SY-0012 (لم يُؤكَّد)، SY-0013 (بلا شركة شحن)" — for a dialog body. */
export function describeRefused(refused: { orderNumber: string; reason: string }[]): string {
  return refused.map((r) => `${r.orderNumber} (${r.reason})`).join('، ');
}
