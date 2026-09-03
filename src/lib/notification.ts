import { db } from './db';

export async function createNotification({
  companyId,
  userId,
  title,
  message,
  type = 'SYSTEM_ALERT',
  link,
}: {
  companyId: string;
  userId?: string | null;
  title: string;
  message: string;
  type?: 'ORDER_NEW' | 'FOLLOW_UP' | 'LOW_STOCK' | 'HIGH_REJECTION' | 'SYSTEM_ALERT' | 'PERFORMANCE';
  link?: string;
}) {
  try {
    return await db.notification.create({
      data: {
        companyId,
        userId: userId || null,
        title,
        message,
        type,
        link,
      },
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}
