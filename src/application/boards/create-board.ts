import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";

export class InvalidBoardError extends Error {}

export interface CreateBoardInput {
  projectId: string;
  name: string;
  description: string;
}

/** Mirrors Board's validates_presence_of/length_of :name (max 30), :description (max 255). */
export async function createBoard(repositories: { boardRepository: BoardRepository }, input: CreateBoardInput): Promise<Board> {
  if (input.name.trim().length === 0 || input.name.length > 30) {
    throw new InvalidBoardError("名前は1〜30文字で入力してください。");
  }
  if (input.description.trim().length === 0 || input.description.length > 255) {
    throw new InvalidBoardError("説明は1〜255文字で入力してください。");
  }

  return repositories.boardRepository.create({
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    position: 0,
  });
}
