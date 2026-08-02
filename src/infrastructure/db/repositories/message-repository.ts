import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { boards } from "@/infrastructure/db/schema/boards";
import { messages } from "@/infrastructure/db/schema/messages";
import type { Message } from "@/domain/message/entity";
import type { MessageRepository } from "@/domain/message/repository";

function toDomain(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    boardId: row.boardId,
    parentId: row.parentId,
    authorId: row.authorId,
    subject: row.subject,
    content: row.content,
    locked: row.locked,
    sticky: row.sticky,
    repliesCount: row.repliesCount,
    createdAt: row.createdAt,
  };
}

export class DrizzleMessageRepository implements MessageRepository {
  async findById(id: string): Promise<Message | null> {
    const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async listTopicsByBoard(boardId: string): Promise<Message[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.boardId, boardId), isNull(messages.parentId)))
      .orderBy(messages.createdAt);
    return rows.map(toDomain);
  }

  async listByProject(projectId: string): Promise<Message[]> {
    const rows = await db
      .select({ message: messages })
      .from(messages)
      .innerJoin(boards, eq(boards.id, messages.boardId))
      .where(eq(boards.projectId, projectId))
      .orderBy(messages.createdAt);
    return rows.map((row) => toDomain(row.message));
  }

  async listReplies(parentId: string): Promise<Message[]> {
    const rows = await db.select().from(messages).where(eq(messages.parentId, parentId)).orderBy(messages.createdAt);
    return rows.map(toDomain);
  }

  async create(message: Omit<Message, "id" | "repliesCount" | "createdAt">): Promise<Message> {
    const [row] = await db
      .insert(messages)
      .values({
        boardId: message.boardId,
        parentId: message.parentId,
        authorId: message.authorId,
        subject: message.subject,
        content: message.content,
        locked: message.locked,
        sticky: message.sticky,
      })
      .returning();
    return toDomain(row);
  }

  async update(id: string, changes: { subject?: string; content?: string; locked?: boolean; sticky?: boolean }): Promise<Message> {
    const [row] = await db.update(messages).set(changes).where(eq(messages.id, id)).returning();
    return toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  async incrementRepliesCount(parentId: string): Promise<void> {
    await db
      .update(messages)
      .set({ repliesCount: sql`${messages.repliesCount} + 1` })
      .where(eq(messages.id, parentId));
  }

  async search(projectId: string, query: string): Promise<Message[]> {
    const rows = await db
      .select({ message: messages })
      .from(messages)
      .innerJoin(boards, eq(boards.id, messages.boardId))
      .where(
        and(
          eq(boards.projectId, projectId),
          sql`to_tsvector('english', ${messages.subject} || ' ' || ${messages.content}) @@ plainto_tsquery('english', ${query})`,
        ),
      )
      .orderBy(messages.createdAt);
    return rows.map((row) => toDomain(row.message));
  }
}
