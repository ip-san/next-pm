import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";
import { validParents } from "@/domain/board/tree";
import { InvalidBoardError, validateBoardFields } from "@/domain/board/validate";

export { InvalidBoardError };

export interface UpdateBoardInput {
  boardId: string;
  projectId: string;
  parentId: string | null;
  name: string;
  description: string;
}

/**
 * Mirrors BoardsController#update with `safe_attributes 'name', 'description', 'parent_id'`.
 * The parent check is Board#validate_board: `valid_parents` is the project's boards minus the
 * board's own subtree, so re-parenting can never close the tree into a cycle.
 */
export async function updateBoard(repositories: { boardRepository: BoardRepository }, input: UpdateBoardInput): Promise<Board> {
  validateBoardFields(input.name, input.description);

  const projectBoards = await repositories.boardRepository.listByProject(input.projectId);
  const current = projectBoards.find((board) => board.id === input.boardId);
  if (!current) {
    throw new InvalidBoardError("フォーラムが見つかりません。");
  }

  if (input.parentId === current.parentId) {
    return repositories.boardRepository.update(current.id, { name: input.name, description: input.description });
  }

  if (input.parentId !== null && !validParents(projectBoards, current.id).some((board) => board.id === input.parentId)) {
    throw new InvalidBoardError("この親フォーラムは指定できません。");
  }

  // acts_as_positioned#update_position: a record whose scope changed is removed from the old
  // sibling set (which closes up) and appended to the end of the new one.
  const newSiblings = projectBoards.filter((board) => board.parentId === input.parentId && board.id !== current.id);
  const updated = await repositories.boardRepository.update(current.id, {
    name: input.name,
    description: input.description,
    parentId: input.parentId,
    position: newSiblings.reduce((max, board) => Math.max(max, board.position), 0) + 1,
  });

  const oldSiblings = projectBoards.filter((board) => board.parentId === current.parentId && board.id !== current.id);
  await repositories.boardRepository.applyPositions(
    [...oldSiblings].sort((a, b) => a.position - b.position).map((board, index) => ({ id: board.id, position: index + 1 })),
  );

  return updated;
}
