import type { IssueUpdate } from "./repository";

export interface RollupChild {
  startDate: string | null;
  dueDate: string | null;
  doneRatio: number;
  /** The child's own estimate plus its whole subtree's — Redmine's `total_estimated_hours`. */
  totalEstimatedHours: number;
  isClosed: boolean;
  /** Position of the child's priority in the IssuePriority enumeration; higher is more urgent. */
  priorityPosition: number;
  priorityId: string;
}

export interface RollupOptions {
  dates: boolean;
  priority: boolean;
  doneRatio: boolean;
  /**
   * Set when `issue_done_ratio` is "issue_status" *and* the parent's own status carries a
   * default ratio — Redmine then leaves done_ratio to the status rather than the children.
   */
  doneRatioFixedByStatus: boolean;
  /** Redmine falls back to the default priority when every child is closed. */
  defaultPriorityId: string | null;
}

/**
 * Faithful port of Redmine's `Issue#recalculate_attributes_for` (`app/models/issue.rb`),
 * minus its `p.save` — this returns the changes so the caller can decide how to persist.
 * Returns an empty object when nothing is derived or the issue has no children (Redmine
 * guards every branch on `!leaf?`).
 *
 * Note there is no estimated-hours rollup: Redmine has no `parent_issue_estimated_hours`
 * setting and never overwrites a parent's own `estimated_hours`. It only *displays*
 * `total_estimated_hours`, which is a computed sum, not a stored column.
 */
export function recalculateParentAttributes(children: RollupChild[], options: RollupOptions): IssueUpdate {
  if (children.length === 0) return {};
  const changes: IssueUpdate = {};

  if (options.dates) {
    // start/due = lowest/highest of the children, swapped if that leaves them inverted.
    const starts = children.flatMap((child) => (child.startDate ? [child.startDate] : []));
    const dues = children.flatMap((child) => (child.dueDate ? [child.dueDate] : []));
    let startDate = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
    let dueDate = dues.length > 0 ? dues.reduce((a, b) => (a > b ? a : b)) : null;
    if (startDate && dueDate && dueDate < startDate) {
      [startDate, dueDate] = [dueDate, startDate];
    }
    changes.startDate = startDate;
    changes.dueDate = dueDate;
  }

  if (options.priority) {
    // Highest priority among *open* children. If they're all closed, Redmine falls back to
    // the default priority, and leaves the parent alone when there isn't one.
    const open = children.filter((child) => !child.isClosed);
    if (open.length > 0) {
      const highest = open.reduce((a, b) => (b.priorityPosition > a.priorityPosition ? b : a));
      changes.priorityId = highest.priorityId;
    } else if (options.defaultPriorityId) {
      changes.priorityId = options.defaultPriorityId;
    }
  }

  if (options.doneRatio && !options.doneRatioFixedByStatus) {
    // Average of the children's ratios weighted by their total estimated hours; children
    // with no estimate are weighted at the average of those that have one (or 1 when none
    // do, which collapses to a plain average).
    const weighted = children.filter((child) => child.totalEstimatedHours > 0);
    const average =
      weighted.length > 0 ? weighted.reduce((sum, child) => sum + child.totalEstimatedHours, 0) / weighted.length : 1;
    const done = children.reduce((sum, child) => {
      const estimated = child.totalEstimatedHours > 0 ? child.totalEstimatedHours : average;
      const ratio = child.isClosed ? 100 : child.doneRatio;
      return sum + estimated * ratio;
    }, 0);
    changes.doneRatio = Math.floor(done / (average * children.length));
  }

  return changes;
}
