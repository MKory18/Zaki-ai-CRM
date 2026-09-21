import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, hashPassword, verifyPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { zodMessage } from '@/lib/zod-message';

const profileSchema = z.object({
  name: z.string().trim().min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل').max(80).optional(),
  avatar: z.string().trim().url('رابط الصورة غير صالح').max(500).or(z.literal('')).optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Z]/, 'يجب أن تحتوي على حرف كبير واحد على الأقل')
    .regex(/[a-z]/, 'يجب أن تحتوي على حرف صغير واحد على الأقل')
    .regex(/[0-9]/, 'يجب أن تحتوي على رقم واحد على الأقل')
    .optional(),
});

export async function PATCH(req: Request) {
  try {
    const session = await requireAuth();

    const parsed = profileSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodMessage(parsed.error) },
        { status: 400 }
      );
    }

    const { name, avatar, currentPassword, newPassword } = parsed.data;
    const updateData: any = {};

    if (name) updateData.name = name;
    if (avatar !== undefined) updateData.avatar = avatar || null;

    // Password change requires the current password
    if (newPassword) {
      const user = await db.user.findUnique({ where: { id: session.id } });
      if (!user) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });

      const isMatch = await verifyPassword(currentPassword || '', user.passwordHash);
      if (!isMatch) {
        return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 400 });
      }
      updateData.passwordHash = await hashPassword(newPassword);
      // Invalidate other sessions after password change
      updateData.tokenVersion = { increment: 1 };
    }

    // NOTE: role / status / permissions are intentionally NOT updatable here.
    // Only administrators can change them via /api/users/:id (server-enforced).

    await db.user.update({ where: { id: session.id }, data: updateData });

    await logAudit({
      companyId: session.companyId || 'platform',
      userId: session.id,
      action: 'PROFILE_UPDATED',
      entity: 'User',
      entityId: session.id,
      newData: { name, avatarUpdated: avatar !== undefined, passwordChanged: !!newPassword },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return apiErrorResponse(error);
  }
}
