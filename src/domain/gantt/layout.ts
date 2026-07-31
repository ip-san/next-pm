import type { Issue } from "@/domain/issue/entity";

export interface GanttWindow {
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  /** Inclusive, YYYY-MM-DD. */
  end: string;
}

export interface GanttRow {
  issue: Issue;
  depth: number;
  /** Position of the bar within the window, as a 0-100 percentage, clamped to the window. */
  leftPercent: number;
  widthPercent: number;
}

export interface GanttMonthTick {
  label: string;
  leftPercent: number;
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

function clampDate(date: string, window: GanttWindow): string {
  if (date < window.start) return window.start;
  if (date > window.end) return window.end;
  return date;
}

/**
 * Redmine's Gantt (lib/redmine/helpers/gantt.rb) falls back to whichever of start_date/
 * due_date is present when the other is missing, rather than excluding the issue. Issues
 * with neither are not placed on the timeline at all.
 */
export function effectiveIssueRange(issue: Pick<Issue, "startDate" | "dueDate">): { start: string; end: string } | null {
  const start = issue.startDate ?? issue.dueDate;
  const end = issue.dueDate ?? issue.startDate;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function windowDays(window: GanttWindow): number {
  return daysBetween(window.start, window.end) + 1;
}

/**
 * Builds gantt rows in parent-before-children order (children indented directly beneath
 * their parent, mirroring Redmine's tree rendering), keeping only issues whose effective
 * date range overlaps the window. Bars are clamped to the window, not excluded, when they
 * only partially overlap it.
 */
export function buildGanttRows(issues: Issue[], window: GanttWindow): GanttRow[] {
  const total = windowDays(window);
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const childrenOf = new Map<string | null, Issue[]>();
  for (const issue of issues) {
    const parentKey = issue.parentId && byId.has(issue.parentId) ? issue.parentId : null;
    childrenOf.set(parentKey, [...(childrenOf.get(parentKey) ?? []), issue]);
  }
  for (const group of childrenOf.values()) {
    group.sort((a, b) => (a.startDate ?? a.dueDate ?? "").localeCompare(b.startDate ?? b.dueDate ?? "") || a.id.localeCompare(b.id));
  }

  const rows: GanttRow[] = [];
  function visit(issue: Issue, depth: number) {
    const range = effectiveIssueRange(issue);
    if (range && range.end >= window.start && range.start <= window.end) {
      const clampedStart = clampDate(range.start, window);
      const clampedEnd = clampDate(range.end, window);
      const leftPercent = (daysBetween(window.start, clampedStart) / total) * 100;
      const widthPercent = Math.max((daysBetween(clampedStart, clampedEnd) + 1) / total, 1 / total) * 100;
      rows.push({ issue, depth, leftPercent, widthPercent });
    }
    for (const child of childrenOf.get(issue.id) ?? []) {
      visit(child, depth + 1);
    }
  }
  for (const root of childrenOf.get(null) ?? []) {
    visit(root, 0);
  }
  return rows;
}

/** Window spanning `months` calendar months starting at year-month, e.g. Redmine's default 3-month gantt span. */
export function monthsWindow(year: number, month: number, months: number): GanttWindow {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month - 1 + months, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** One tick per calendar month touched by the window, for the header row. */
export function buildMonthTicks(window: GanttWindow): GanttMonthTick[] {
  const total = windowDays(window);
  const ticks: GanttMonthTick[] = [];
  let firstOfMonth = `${window.start.slice(0, 7)}-01`;
  while (firstOfMonth <= window.end) {
    const tickDate = firstOfMonth < window.start ? window.start : firstOfMonth;
    ticks.push({ label: firstOfMonth.slice(0, 7), leftPercent: (daysBetween(window.start, tickDate) / total) * 100 });
    const next = new Date(Date.parse(firstOfMonth));
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    firstOfMonth = next.toISOString().slice(0, 10);
  }
  return ticks;
}
