import mongoose from 'mongoose';
import { Notification, NotificationType, INotification } from '../models/Notification';
import { httpError } from '../utils/httpError';

export interface NotifyInput {
  userId: string | mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/**
 * Create an in-app notification. Deliberately swallows errors — a failed
 * notification must never fail the business action that triggered it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await Notification.create({
      userId: new mongoose.Types.ObjectId(String(input.userId)),
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
    });
  } catch (err) {
    console.error('[NOTIFY] Failed to create notification:', err);
  }
}

export async function listNotifications(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {}
): Promise<INotification[]> {
  const limit = Math.min(100, Math.max(1, opts.limit || 30));
  const filter: Record<string, any> = { userId: new mongoose.Types.ObjectId(userId) };
  if (opts.unreadOnly) filter.readAt = { $exists: false };
  return Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    readAt: { $exists: false },
  });
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  if (!mongoose.isValidObjectId(notificationId)) throw httpError(400, 'Invalid notification ID');
  const res = await Notification.updateOne(
    { _id: notificationId, userId: new mongoose.Types.ObjectId(userId), readAt: { $exists: false } },
    { $set: { readAt: new Date() } }
  );
  if (res.matchedCount === 0) {
    // Either already read or not theirs — only 404 when it truly doesn't belong to them
    const owned = await Notification.exists({ _id: notificationId, userId });
    if (!owned) throw httpError(404, 'Notification not found');
  }
}

export async function markAllRead(userId: string): Promise<number> {
  const res = await Notification.updateMany(
    { userId: new mongoose.Types.ObjectId(userId), readAt: { $exists: false } },
    { $set: { readAt: new Date() } }
  );
  return res.modifiedCount;
}
