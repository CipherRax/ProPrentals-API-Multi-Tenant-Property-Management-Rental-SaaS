import { BillingFrequency } from '@prisma/client';

const FREQUENCY_MONTHS: Record<BillingFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUALLY: 12,
};

/**
 * Adds N months to a date, matching the day-of-month where possible and
 * clamping to the shorter month's last day otherwise (e.g. Jan 31 + 1
 * month → Feb 28/29, not March 3).
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInTargetMonth));
  return result;
}

/**
 * Billing periods are anchored to the tenancy's actual start date rather
 * than calendar-month boundaries — simpler and avoids prorating partial
 * first/last periods, at the cost of periods not always running the 1st
 * to end-of-month. Flagged in the README as a deliberate simplification.
 */
export function nextBillingPeriod(
  previousPeriodEnd: Date | null,
  tenancyStartDate: Date,
  frequency: BillingFrequency,
): { start: Date; end: Date } {
  const months = FREQUENCY_MONTHS[frequency];
  const start = previousPeriodEnd ?? tenancyStartDate;
  const end = addMonthsClamped(start, months);
  return { start, end };
}

/**
 * Due date within a billing period, expressed as "day N of the period's
 * starting month" — clamped so a dueDay of 31 doesn't overflow a
 * 30-day month.
 */
export function computeDueDate(periodStart: Date, paymentDueDay: number): Date {
  const daysInMonth = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
  const day = Math.min(paymentDueDay, daysInMonth);
  return new Date(periodStart.getFullYear(), periodStart.getMonth(), day);
}
