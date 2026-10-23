import { t } from '../../strings';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateAndTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * When `time` was, for a list: "Just now", "2 min ago", "3 h ago" (today), "Yesterday", then the date
 * ("12 Oct"), with the year when it is not this year's. Times in the future count as just now.
 */
export function relativeTime(time: number, now: number = Date.now()): string {
  const elapsed = now - time;
  if (elapsed < MINUTE) return t.start.recent.justNow;
  if (elapsed < HOUR) return t.start.recent.minutesAgo(Math.floor(elapsed / MINUTE));
  const today = startOfDay(now);
  if (time >= today) return t.start.recent.hoursAgo(Math.floor(elapsed / HOUR));
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (time >= yesterday.getTime()) return t.start.recent.yesterday;
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? dayMonth : dayMonthYear).format(time);
}

/** The full date and time, for a tooltip: "12 Oct 2026, 14:05". */
export function fullDateTime(time: number): string {
  return dateAndTime.format(time);
}
