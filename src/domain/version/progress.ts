export interface VersionProgressIssue {
  isClosed: boolean;
  doneRatio: number;
}

export interface VersionProgress {
  openCount: number;
  closedCount: number;
  closedPercent: number;
  completedPercent: number;
}

/**
 * Simplified version of Version#completed_percent — Redmine weights by estimated_hours,
 * we weight every issue equally via its done_ratio (closed issues count as 100%).
 */
export function computeVersionProgress(issues: VersionProgressIssue[]): VersionProgress {
  const openCount = issues.filter((issue) => !issue.isClosed).length;
  const closedCount = issues.length - openCount;
  const total = openCount + closedCount;
  if (total === 0) {
    return { openCount, closedCount, closedPercent: 0, completedPercent: 0 };
  }

  const closedPercent = (closedCount / total) * 100;
  const openDoneRatioSum = issues.filter((issue) => !issue.isClosed).reduce((sum, issue) => sum + issue.doneRatio, 0);
  const completedPercent = (closedCount * 100 + openDoneRatioSum) / total;

  return { openCount, closedCount, closedPercent, completedPercent };
}
