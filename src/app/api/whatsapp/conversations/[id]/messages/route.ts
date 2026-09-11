/**
 * POST /api/whatsapp/conversations/[id]/messages — send a text message via
 * the official Meta Cloud API. All credentials and Meta calls are server-side;
 * the client can only supply the text. Rate limited + RBAC + tenant scoped.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendOutboundMessage } from '@/lib/whatsapp/send';
import { apiErrorResponse } from '@/lib/api-error';

const bodySchema = z.object({ text: z.string().trim().min(1).max(4096) }).strict();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'الرسالة غير صالحة' }, { status: 400 });
    }
    const result = await sendOutboundMessage(id, parsed.data.text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      message: {
        id: result.message.id,
        direction: result.message.direction,
        messageType: result.message.messageType,
        text: result.message.text,
        status: result.message.status,
        createdAt: result.message.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
