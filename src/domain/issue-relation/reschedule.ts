/** Adds `days` (may be negative) to a YYYY-MM-DD date string, returning YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

export interface PredecessorDates {
  startDate: string | null;
  dueDate: string | null;
  delay: number | null;
}

/**
 * Mirrors IssueRelation#successor_soonest_start + Issue#soonest_start: the earliest a
 * successor may start, given ALL of its "precedes" predecessors (not just whichever one
 * changed) — the latest predecessor's (due_date || start_date) + 1 + delay wins. Returns
 * null when no predecessor has any date to anchor from.
 */
export function computeSoonestStart(predecessors: PredecessorDates[]): string | null {
  let soonest: string | null = null;
  for (const predecessor of predecessors) {
    const anchor = predecessor.dueDate ?? predecessor.startDate;
    if (!anchor) continue;
    const candidate = addDays(anchor, 1 + (predecessor.delay ?? 0));
    if (!soonest || candidate > soonest) soonest = candidate;
  }
  return soonest;
}

/**
 * Mirrors Issue#reschedule_after: only pushes a successor forward — never pulls it earlier
 * than its current start_date — and preserves the issue's own duration (due_date - start_date,
 * defaulting to 0 when either is missing) when shifting. Returns null when no reschedule is
 * needed (the successor already starts on or after soonestStart).
 */
export function computeRescheduledDates(
  successor: { startDate: string | null; dueDate: string | null },
  soonestStart: string,
): { startDate: string; dueDate: string } | null {
  if (successor.startDate && successor.startDate >= soonestStart) return null;
  const duration = successor.startDate && successor.dueDate ? daysBetween(successor.startDate, successor.dueDate) : 0;
  return { startDate: soonestStart, dueDate: addDays(soonestStart, duration) };
}
