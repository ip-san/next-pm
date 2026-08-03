export type TimeReportCriterion = "user" | "activity" | "issue";
export type TimeReportColumnUnit = "month" | "week" | "day";

export interface TimeReportEntryInput {
  spentOn: string;
  hours: number;
  userId: string;
  activityId: string;
  issueId: string | null;
}

export interface TimeReportRow {
  key: string | null;
  hoursByPeriod: Map<string, number>;
  total: number;
}

export interface TimeReport {
  periods: string[];
  rows: TimeReportRow[];
  totalsByPeriod: Map<string, number>;
  grandTotal: number;
}

// Mirrors Redmine::Helpers::TimeReport's "100 columns max" guard against runaway period lists.
const MAX_PERIODS = 100;

function isoWeekday(date: Date): number {
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function parseDate(spentOn: string): Date {
  const [year, month, day] = spentOn.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoWeek(date: Date): { isoYear: number; week: number } {
  const thursday = addDays(date, 4 - isoWeekday(date));
  const isoYear = thursday.getUTCFullYear();
  const jan1Thursday = addDays(new Date(Date.UTC(isoYear, 0, 1)), 4 - isoWeekday(new Date(Date.UTC(isoYear, 0, 1))));
  const week = Math.round((thursday.getTime() - jan1Thursday.getTime()) / (7 * 86400000)) + 1;
  return { isoYear, week };
}

function periodLabelForDate(date: Date, columnUnit: TimeReportColumnUnit): string {
  switch (columnUnit) {
    case "day":
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    case "month":
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
    case "week": {
      const { isoYear, week } = isoWeek(date);
      return `${isoYear}-W${pad(week)}`;
    }
  }
}

function periodStart(date: Date, columnUnit: TimeReportColumnUnit): Date {
  switch (columnUnit) {
    case "day":
      return date;
    case "week":
      return addDays(date, -(isoWeekday(date) - 1));
    case "month":
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }
}

function stepPeriod(date: Date, columnUnit: TimeReportColumnUnit): Date {
  switch (columnUnit) {
    case "day":
      return addDays(date, 1);
    case "week":
      return addDays(date, 7);
    case "month":
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  }
}

function keyOf(entry: TimeReportEntryInput, criterion: TimeReportCriterion): string | null {
  switch (criterion) {
    case "user":
      return entry.userId;
    case "activity":
      return entry.activityId;
    case "issue":
      return entry.issueId;
  }
}

/**
 * Mirrors Redmine::Helpers::TimeReport: groups time entries into a pivot of period columns
 * (month/week/day) x criterion rows, each cell summing spent hours. Redmine offers up to 3
 * simultaneous criteria (project/status/version/category/tracker/user/activity/issue, plus
 * custom fields); this first pass covers a single criterion at a time — the three most useful
 * for a per-project report (user, activity, issue).
 */
export function buildTimeReport(
  entries: TimeReportEntryInput[],
  criterion: TimeReportCriterion,
  columnUnit: TimeReportColumnUnit,
): TimeReport {
  if (entries.length === 0) {
    return { periods: [], rows: [], totalsByPeriod: new Map(), grandTotal: 0 };
  }

  const rowsByKey = new Map<string | null, Map<string, number>>();
  let minDate = parseDate(entries[0].spentOn);
  let maxDate = minDate;

  for (const entry of entries) {
    const date = parseDate(entry.spentOn);
    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;

    const key = keyOf(entry, criterion);
    const label = periodLabelForDate(date, columnUnit);
    const row = rowsByKey.get(key) ?? new Map<string, number>();
    row.set(label, (row.get(label) ?? 0) + entry.hours);
    rowsByKey.set(key, row);
  }

  const periods: string[] = [];
  let cursor = periodStart(minDate, columnUnit);
  while (cursor <= maxDate && periods.length < MAX_PERIODS) {
    periods.push(periodLabelForDate(cursor, columnUnit));
    cursor = stepPeriod(cursor, columnUnit);
  }

  const rows: TimeReportRow[] = [...rowsByKey.entries()]
    .map(([key, hoursByPeriod]) => ({
      key,
      hoursByPeriod,
      total: [...hoursByPeriod.values()].reduce((sum, hours) => sum + hours, 0),
    }))
    .sort((a, b) => (a.key ?? "").localeCompare(b.key ?? ""));

  const totalsByPeriod = new Map<string, number>();
  for (const period of periods) {
    let sum = 0;
    for (const row of rows) {
      sum += row.hoursByPeriod.get(period) ?? 0;
    }
    totalsByPeriod.set(period, sum);
  }

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return { periods, rows, totalsByPeriod, grandTotal };
}
