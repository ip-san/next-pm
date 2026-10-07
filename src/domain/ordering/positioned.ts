/**
 * A row of a Redmine-style ordered list (`lib/redmine/acts/positioned.rb`): every row in one
 * scope holds a contiguous 1-based `position`, and reordering is expressed as "move this row
 * to position N", not as a swap.
 */
export interface Positioned {
  id: string;
  position: number;
}

/** Where a reorder control sends a row — the four moves Redmine's admin lists offer. */
export type PositionMove = "highest" | "higher" | "lower" | "lowest";

/** Sorted by (position, id) so a list whose positions collide still has one deterministic order. */
function sortedByPosition<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.position === b.position ? a.id.localeCompare(b.id) : a.position - b.position));
}

/**
 * Renumbers `items` 1..n and moves `id` to the 1-based `targetPosition`, returning the new
 * position of every row whose position actually changes.
 *
 * Mirrors Redmine's `reset_positions_in_list`: the list is renumbered from its (position, id)
 * order before the move, so a list that drifted out of contiguity heals on the first reorder.
 * That matters here because every admin create inserts `position: 0` — without the renumbering
 * step a first move would have nothing meaningful to shift against.
 *
 * Returns an empty array when `id` isn't in the list or nothing would change.
 */
export function moveToPosition(items: readonly Positioned[], id: string, targetPosition: number): Positioned[] {
  const ordered = sortedByPosition(items);
  const fromIndex = ordered.findIndex((item) => item.id === id);
  if (fromIndex === -1) return [];

  const toIndex = Math.min(Math.max(targetPosition, 1), ordered.length) - 1;
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);

  const changed: Positioned[] = [];
  ordered.forEach((item, index) => {
    const position = index + 1;
    if (item.position !== position) {
      changed.push({ id: item.id, position });
    }
  });
  return changed;
}

/** Resolves one of the four reorder controls against the row's current place in the list. */
export function resolveMove(items: readonly Positioned[], id: string, move: PositionMove): Positioned[] {
  const ordered = sortedByPosition(items);
  const index = ordered.findIndex((item) => item.id === id);
  if (index === -1) return [];

  const target =
    move === "highest" ? 1 : move === "lowest" ? ordered.length : move === "higher" ? index : index + 2;
  return moveToPosition(ordered, id, target);
}

/** The position a newly created row takes — Redmine's `set_default_position` (max + 1). */
export function nextPosition(items: readonly Positioned[]): number {
  return items.reduce((max, item) => Math.max(max, item.position), 0) + 1;
}
