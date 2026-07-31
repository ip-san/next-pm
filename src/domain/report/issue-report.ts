import type { Issue } from "@/domain/issue/entity";

export interface ReportCounts {
  open: number;
  closed: number;
  total: number;
}

/**
 * Mirrors Redmine's reports/_simple.html.erb: one open/closed/total row per group key,
 * keyed by whatever field the caller groups on (tracker_id, priority_id, ...). Issues whose
 * grouping field is null bucket under `null`, matching Redmine's "[none]" row.
 */
export function aggregateIssueCounts(
  issues: Issue[],
  closedStatusIds: ReadonlySet<string>,
  keyOf: (issue: Issue) => string | null,
): Map<string | null, ReportCounts> {
  const counts = new Map<string | null, ReportCounts>();
  for (const issue of issues) {
    const key = keyOf(issue);
    const row = counts.get(key) ?? { open: 0, closed: 0, total: 0 };
    if (closedStatusIds.has(issue.statusId)) {
      row.closed++;
    } else {
      row.open++;
    }
    row.total++;
    counts.set(key, row);
  }
  return counts;
}

export function totalCounts(counts: Map<string | null, ReportCounts>): ReportCounts {
  let open = 0;
  let closed = 0;
  let total = 0;
  for (const row of counts.values()) {
    open += row.open;
    closed += row.closed;
    total += row.total;
  }
  return { open, closed, total };
}
