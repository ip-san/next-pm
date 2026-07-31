import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { boards } from "@/infrastructure/db/schema/boards";
import type { Board } from "@/domain/board/entity";
import type { BoardRepository } from "@/domain/board/repository";

function toDomain(row: typeof boards.$inferSelect): Board {
  return {
    id: row.id,
    projectId: row.projectId,
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
      .values({ projectId: board.projectId, name: board.name, description: board.description, position: board.position })
      .returning();
    return toDomain(row);
  }
}
