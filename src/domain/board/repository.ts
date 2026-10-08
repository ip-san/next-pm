import type { Board } from "./entity";

export interface BoardRepository {
  listByProject(projectId: string): Promise<Board[]>;
  findById(id: string): Promise<Board | null>;
  create(board: Omit<Board, "id">): Promise<Board>;
  update(id: string, changes: { name?: string; description?: string; parentId?: string | null; position?: number }): Promise<Board>;
  /** Cascades to the board's messages; child boards are promoted to the top level (Redmine `dependent: :nullify`). */
  delete(id: string): Promise<void>;
  /** Writes a whole renumbered sibling set in one go — see domain/board/tree.ts `repositionSiblings`. */
  applyPositions(positions: { id: string; position: number }[]): Promise<void>;
}
