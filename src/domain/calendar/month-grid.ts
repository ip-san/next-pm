/**
 * Mirrors Redmine::Helpers::Calendar's :month period (lib/redmine/helpers/calendar.rb):
 * the grid always covers full weeks, so it pads with trailing days of the previous month
 * and leading days of the next month. Weeks start on Monday (ISO 8601), matching
 * first_wday for locales without a configured week start.
 */
export interface MonthGrid {
  year: number;
  month: number;
  /** Inclusive range of the full grid, as YYYY-MM-DD, including the padding days. */
  startDate: string;
  endDate: string;
  /** Each week is 7 YYYY-MM-DD strings, Monday through Sunday. */
  weeks: string[][];
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
function isoWeekday(date: Date): number {
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function buildMonthGrid(year: number, month: number): MonthGrid {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, month, 0));

  const startDate = addDays(firstOfMonth, -((isoWeekday(firstOfMonth) - 1) % 7));
  const endDate = addDays(lastOfMonth, (7 - isoWeekday(lastOfMonth)) % 7);

  const weeks: string[][] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toIsoDate(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  return { year, month, startDate: toIsoDate(startDate), endDate: toIsoDate(endDate), weeks };
}

/** Parses ?year=&month=, falling back to `now` on missing/malformed/out-of-range input. */
export function parseYearMonth(yearParam: string | undefined, monthParam: string | undefined, now: Date): { year: number; month: number } {
  const year = Number(yearParam);
  const month = Number(monthParam);
  if (Number.isInteger(year) && year > 1900 && year < 9999 && Number.isInteger(month) && month >= 1 && month <= 12) {
    return { year, month };
  }
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
