import { describe, expect, it } from 'vitest';

import {
  buildCalendarWeeks,
  isInRange,
  monthTitle,
  orderedRange,
  parseDateKey,
  toDateKey,
  WEEKDAY_LABELS,
} from './date-picker';

describe('date-picker helpers', () => {
  it('round-trips local calendar dates without UTC shift', () => {
    const date = new Date(2026, 7, 20);
    expect(toDateKey(date)).toBe('2026-08-20');
    expect(parseDateKey('2026-08-20')?.getDate()).toBe(20);
    expect(parseDateKey('2026-02-31')).toBeNull();
  });

  it('builds a Monday-first grid that includes leading days', () => {
    expect(WEEKDAY_LABELS[0]).toBe('一');
    const weeks = buildCalendarWeeks(new Date(2026, 7, 1));
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.map((day) => day.key)).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
    expect(weeks[0]?.[5]?.inMonth).toBe(true);
    expect(weeks[0]?.[0]?.inMonth).toBe(false);
    expect(monthTitle(new Date(2026, 7, 20))).toBe('2026年8月');
  });

  it('orders and fills a date range', () => {
    expect(orderedRange('2026-08-20', '2026-08-10')).toEqual([
      '2026-08-10',
      '2026-08-20',
    ]);
    expect(isInRange('2026-08-12', '2026-08-20', '2026-08-10')).toBe(true);
    expect(isInRange('2026-08-09', '2026-08-10', '2026-08-20')).toBe(false);
  });
});
