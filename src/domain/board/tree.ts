import type { Board } from "./entity";

export interface BoardTreeNode {
  board: Board;
  level: number;
}

/**
 * Mirrors `Board.board_tree`: depth-first over the project's boards, siblings ordered by
 * position, each node carrying its indent level.
 */
export function boardTree(boards: Board[], parentId: string | null = null, level = 0): BoardTreeNode[] {
  const tree: BoardTreeNode[] = [];
  for (const board of boards.filter((b) => b.parentId === parentId).sort((a, b) => a.position - b.position)) {
    tree.push({ board, level });
    tree.push(...boardTree(boards, board.id, level + 1));
  }
  return tree;
}

/** The board itself plus every board below it — Redmine's `self_and_descendants`. */
export function selfAndDescendantIds(boards: Board[], boardId: string): Set<string> {
  const ids = new Set<string>([boardId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const board of boards) {
      if (board.parentId !== null && ids.has(board.parentId) && !ids.has(board.id)) {
        ids.add(board.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * Mirrors `Board#valid_parents` (`project.boards - self_and_descendants`), which is what
 * `validate_board` checks: a parent must live in the same project and must be neither the
 * board itself nor anything underneath it, so the tree can never close into a cycle.
 */
export function validParents(projectBoards: Board[], boardId: string): Board[] {
  const excluded = selfAndDescendantIds(projectBoards, boardId);
  return projectBoards.filter((board) => !excluded.has(board.id));
}

/**
 * Mirrors `acts_as_positioned`: positions stay 1-based and dense inside one sibling set.
 * Returns the whole sibling set renumbered after moving `boardId` to `newPosition`, so the
 * caller writes a consistent list instead of replaying Redmine's incremental shifts.
 */
export function repositionSiblings(siblings: Board[], boardId: string, newPosition: number): { id: string; position: number }[] {
  const ordered = [...siblings].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const from = ordered.findIndex((board) => board.id === boardId);
  if (from === -1) {
    return ordered.map((board, index) => ({ id: board.id, position: index + 1 }));
  }

  const target = Math.min(Math.max(newPosition, 1), ordered.length);
  const [moved] = ordered.splice(from, 1);
  ordered.splice(target - 1, 0, moved);
  return ordered.map((board, index) => ({ id: board.id, position: index + 1 }));
}
