import { db } from './db';

export async function logAudit({
  companyId,
  userId,
  action,
  entity,
  entityId,
  previousData,
  newData,
}: {
  companyId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  previousData?: any;
  newData?: any;
}) {
  try {
    await db.auditLog.create({
      data: {
        companyId,
        userId: userId || null,
        action,
        entity,
        entityId,
        previousData: previousData ? JSON.stringify(previousData) : null,
        newData: newData ? JSON.stringify(newData) : null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
