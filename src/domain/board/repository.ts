import type { Board } from "./entity";

export interface BoardRepository {
  listByProject(projectId: string): Promise<Board[]>;
  findById(id: string): Promise<Board | null>;
  create(board: Omit<Board, "id">): Promise<Board>;
}
