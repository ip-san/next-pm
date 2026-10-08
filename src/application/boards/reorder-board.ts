import type { BoardRepository } from "@/domain/board/repository";
import { repositionSiblings } from "@/domain/board/tree";
import { InvalidBoardError } from "@/domain/board/validate";

export { InvalidBoardError };

export interface ReorderBoardInput {
  boardId: string;
  projectId: string;
  /** 1-based target position inside the board's own sibling set, as Redmine's `board[position]`. */
  position: number;
}

/** Mirrors BoardsController#update when only `position` changes (acts_as_positioned#shift_positions). */
export async function reorderBoard(repositories: { boardRepository: BoardRepository }, input: ReorderBoardInput): Promise<void> {
  const projectBoards = await repositories.boardRepository.listByProject(input.projectId);
  const board = projectBoards.find((candidate) => candidate.id === input.boardId);
  if (!board) {
    throw new InvalidBoardError("フォーラムが見つかりません。");
  }

  const siblings = projectBoards.filter((candidate) => candidate.parentId === board.parentId);
  await repositories.boardRepository.applyPositions(repositionSiblings(siblings, board.id, input.position));
}
