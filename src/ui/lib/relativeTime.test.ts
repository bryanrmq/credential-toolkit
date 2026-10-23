import { describe, expect, it } from 'vitest';
import { fullDateTime, relativeTime } from './relativeTime';

const now = new Date(2026, 9, 23, 15, 30).getTime();
const at = (month: number, day: number, hours = 12, minutes = 0, year = 2026) => new Date(year, month, day, hours, minutes).getTime();

describe('relativeTime', () => {
  it('says just now within a minute, and for a time ahead of the clock', () => {
    expect(relativeTime(now - 30_000, now)).toBe('Just now');
    expect(relativeTime(now + 5_000, now)).toBe('Just now');
  });

  it('counts minutes within the hour and hours earlier today', () => {
    expect(relativeTime(now - 2 * 60_000, now)).toBe('2 min ago');
    expect(relativeTime(now - 59 * 60_000, now)).toBe('59 min ago');
    expect(relativeTime(at(9, 23, 12, 0), now)).toBe('3 h ago');
    expect(relativeTime(at(9, 23, 0, 5), now)).toBe('15 h ago');
  });

  it('says yesterday for any time the day before', () => {
    expect(relativeTime(at(9, 22, 23, 50), now)).toBe('Yesterday');
    expect(relativeTime(at(9, 22, 0, 0), now)).toBe('Yesterday');
  });

  it('gives the date before that, with the year only when it differs', () => {
    expect(relativeTime(at(9, 12), now)).toBe('12 Oct');
    expect(relativeTime(at(11, 3, 12, 0, 2025), now)).toBe('3 Dec 2025');
  });
});

describe('fullDateTime', () => {
  it('gives the date and the time', () => {
    expect(fullDateTime(at(9, 12, 14, 5))).toBe('12 Oct 2026, 14:05');
  });
});
