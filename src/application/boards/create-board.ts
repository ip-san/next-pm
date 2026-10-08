import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";
import { InvalidBoardError, validateBoardFields } from "@/domain/board/validate";

export { InvalidBoardError };

export interface CreateBoardInput {
  projectId: string;
  parentId: string | null;
  name: string;
  description: string;
}

/** Mirrors BoardsController#create with `safe_attributes 'name', 'description', 'parent_id'`. */
export async function createBoard(repositories: { boardRepository: BoardRepository }, input: CreateBoardInput): Promise<Board> {
  validateBoardFields(input.name, input.description);

  const projectBoards = await repositories.boardRepository.listByProject(input.projectId);
  if (input.parentId !== null && !projectBoards.some((board) => board.id === input.parentId)) {
    // Board#validate_board restricts the parent to the project's own boards.
    throw new InvalidBoardError("親フォーラムが見つかりません。");
  }

  // acts_as_positioned's set_default_position: a new record lands at the end of its sibling set.
  const siblings = projectBoards.filter((board) => board.parentId === input.parentId);
  const position = siblings.reduce((max, board) => Math.max(max, board.position), 0) + 1;

  return repositories.boardRepository.create({
    projectId: input.projectId,
    parentId: input.parentId,
    name: input.name,
    description: input.description,
    position,
  });
}
