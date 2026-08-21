export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export interface CalendarDay {
  key: string;
  date: Date;
  inMonth: boolean;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function addMonths(date: Date, count: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + count, 1);
  const day = Math.min(
    date.getDate(),
    new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
  );
  next.setDate(day);
  return next;
}

export function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

export function monthTitle(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function compareDateKey(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isInRange(
  key: string,
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end) {
    return false;
  }

  const [from, to] =
    compareDateKey(start, end) <= 0 ? [start, end] : [end, start];
  return compareDateKey(key, from) >= 0 && compareDateKey(key, to) <= 0;
}

export function orderedRange(
  start: string | null,
  end: string | null,
): [string | null, string | null] {
  if (!start || !end) {
    return [start, end];
  }

  return compareDateKey(start, end) <= 0 ? [start, end] : [end, start];
}

export function buildCalendarWeeks(view: Date): CalendarDay[][] {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const weekday = first.getDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  const cursor = addDays(first, -mondayOffset);
  const weeks: CalendarDay[][] = [];

  for (let week = 0; week < 6; week += 1) {
    const days: CalendarDay[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(cursor, week * 7 + day);
      days.push({
        key: toDateKey(date),
        date,
        inMonth: date.getMonth() === view.getMonth(),
      });
    }
    weeks.push(days);
  }

  return weeks;
}
