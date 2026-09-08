import { NotificationCategory, NotificationType } from '@prisma/client';

// Maps each granular event type to the coarser user-facing toggle group
// it belongs to (spec §28). A type not in this map is treated as
// always-on (e.g. nothing critical enough to gate should be missing
// here, but this fails open rather than silently dropping a
// notification if a new type is ever added without updating the map).
export const NOTIFICATION_CATEGORY_MAP: Partial<Record<NotificationType, NotificationCategory>> = {
  RENT_DUE: 'RENT_REMINDERS',
  RENT_DUE_SOON: 'RENT_REMINDERS',
  RENT_OVERDUE: 'RENT_REMINDERS',
  RENT_CHANGED: 'RENT_REMINDERS',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMATIONS',
  PAYMENT_FAILED: 'PAYMENT_CONFIRMATIONS',
  RECEIPT_GENERATED: 'PAYMENT_CONFIRMATIONS',
  DEPOSIT_PROCESSED: 'PAYMENT_CONFIRMATIONS',
  NEW_MESSAGE: 'MESSAGES',
  NEW_ANNOUNCEMENT: 'ANNOUNCEMENTS',
  MAINTENANCE_CREATED: 'MAINTENANCE_UPDATES',
  MAINTENANCE_UPDATED: 'MAINTENANCE_UPDATES',
  LEASE_EXPIRING: 'LEASE_REMINDERS',
  SUBSCRIPTION_EXPIRING: 'PAYMENT_CONFIRMATIONS',
  SUBSCRIPTION_PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMATIONS',
  SUBSCRIPTION_PAYMENT_FAILED: 'PAYMENT_CONFIRMATIONS',
};
