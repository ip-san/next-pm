import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { boards } from "@/infrastructure/db/schema/boards";
import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";

function toDomain(row: typeof boards.$inferSelect): Board {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    name: row.name,
    description: row.description,
    position: row.position,
  };
}

export class DrizzleBoardRepository implements BoardRepository {
  async listByProject(projectId: string): Promise<Board[]> {
    const rows = await db.select().from(boards).where(eq(boards.projectId, projectId)).orderBy(boards.position);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Board | null> {
    const [row] = await db.select().from(boards).where(eq(boards.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(board: Omit<Board, "id">): Promise<Board> {
    const [row] = await db
      .insert(boards)
      .values({
        projectId: board.projectId,
        parentId: board.parentId,
        name: board.name,
        description: board.description,
        position: board.position,
      })
      .returning();
    return toDomain(row);
  }

  async update(id: string, changes: { name?: string; description?: string; parentId?: string | null; position?: number }): Promise<Board> {
    const [row] = await db.update(boards).set(changes).where(eq(boards.id, id)).returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    // boards.parent_id is ON DELETE SET NULL and messages.board_id is ON DELETE CASCADE, so the
    // database reproduces Redmine's `acts_as_tree :dependent => :nullify` +
    // `has_many :messages, :dependent => :destroy` without a second pass here.
    await db.delete(boards).where(eq(boards.id, id));
  }

  async applyPositions(positions: { id: string; position: number }[]): Promise<void> {
    if (positions.length === 0) return;
    await db.transaction(async (tx) => {
      for (const { id, position } of positions) {
        await tx.update(boards).set({ position }).where(eq(boards.id, id));
      }
    });
  }
}
