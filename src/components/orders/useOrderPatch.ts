'use client';

import { useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAsk } from '@/components/ui/Confirm';
import { MAX_REASON, MIN_REASON } from '@/lib/order-edit-reason';

/**
 * SAVING AN ORDER, INCLUDING THE PART WHERE IT ASKS WHY.
 *
 * An edit made on company-wide authority has to say why (see
 * src/lib/order-edit-reason.ts). Who holds that authority is a SCOPE on the
 * grant, and the browser is handed permission keys without their scopes — so
 * a screen that tried to work out for itself whether to ask would either
 * interrogate people who owe no explanation or quietly skip the ones who do.
 *
 * So the server is asked first, and its refusal — `REASON_REQUIRED` — is
 * what opens the dialog. The person types the reason, the same request goes
 * again carrying it, and nothing else about the edit changes. One extra
 * round trip, and it only ever happens to the edits that need it.
 *
 * Cancelling the dialog leaves the order untouched and returns the refusal,
 * so the caller shows it exactly as it shows any other.
 */
export function useOrderPatch() {
  const ask = useAsk();

  return useCallback(
    async (orderId: string, body: Record<string, unknown>): Promise<Response> => {
      const send = (payload: Record<string, unknown>) =>
        apiFetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

      const res = await send(body);
      if (res.status !== 400) return res;

      // Read the body once; hand an untouched copy back if it is not ours.
      const clone = res.clone();
      const data = await clone.json().catch(() => ({} as Record<string, unknown>));
      if (data?.code !== 'REASON_REQUIRED') return res;

      const reason = await ask({
        title: 'سبب التعديل',
        body: 'هذا تعديل بصلاحية على مستوى الشركة. السبب يُحفظ في سجل التدقيق وعلى مسار الطلب، ولا يظهر للعميل.',
        confirmLabel: 'احفظ التعديل',
        input: {
          label: 'لماذا عُدِّل هذا الطلب؟',
          placeholder: 'مثال: اتفاق مع العميل على الهاتف بخصم إضافي',
          required: true,
          multiline: true,
          maxLength: MAX_REASON,
        },
      });

      const trimmed = (reason ?? '').trim();
      if (trimmed.length < MIN_REASON) return res; // cancelled, or too short to mean anything

      return send({ ...body, reason: trimmed });
    },
    [ask]
  );
}
