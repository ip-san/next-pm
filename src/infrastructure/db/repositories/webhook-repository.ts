import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { users } from "@/infrastructure/db/schema/users";
import { webhookProjects, webhooks } from "@/infrastructure/db/schema/webhooks";
import type { Webhook } from "@/domain/webhook/entity";
import type { WebhookEvent } from "@/domain/webhook/events";
import type { WebhookInput, WebhookRepository } from "@/domain/webhook/repository";

type Row = typeof webhooks.$inferSelect;

function toDomain(row: Row, projectIds: string[]): Webhook {
  return {
    id: row.id,
    userId: row.userId,
    url: row.url,
    secret: row.secret,
    events: row.events,
    active: row.active,
    projectIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function attachProjectIds(rows: Row[]): Promise<Webhook[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select()
    .from(webhookProjects)
    .where(inArray(webhookProjects.webhookId, rows.map((row) => row.id)));
  return rows.map((row) =>
    toDomain(
      row,
      links.filter((link) => link.webhookId === row.id).map((link) => link.projectId),
    ),
  );
}

export class DrizzleWebhookRepository implements WebhookRepository {
  async findById(id: string): Promise<Webhook | null> {
    const [row] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
    if (!row) return null;
    const [withProjects] = await attachProjectIds([row]);
    return withProjects;
  }

  async listByUser(userId: string): Promise<Webhook[]> {
    const rows = await db.select().from(webhooks).where(eq(webhooks.userId, userId)).orderBy(webhooks.url);
    return attachProjectIds(rows);
  }

  async listCandidates(event: WebhookEvent, projectId: string): Promise<Webhook[]> {
    const rows = await db
      .select({ webhook: webhooks })
      .from(webhooks)
      .innerJoin(webhookProjects, eq(webhookProjects.webhookId, webhooks.id))
      .innerJoin(users, eq(users.id, webhooks.userId))
      .where(
        and(
          eq(webhooks.active, true),
          eq(webhookProjects.projectId, projectId),
          eq(users.status, "active"),
          // jsonb containment: the events array holds this event.
          sql`${webhooks.events} @> ${JSON.stringify([event])}::jsonb`,
        ),
      );
    return attachProjectIds(rows.map((row) => row.webhook));
  }

  async create(userId: string, input: WebhookInput): Promise<Webhook> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(webhooks)
        .values({ userId, url: input.url, secret: input.secret, events: input.events, active: input.active })
        .returning();
      if (input.projectIds.length > 0) {
        await tx
          .insert(webhookProjects)
          .values(input.projectIds.map((projectId) => ({ webhookId: row.id, projectId })));
      }
      return toDomain(row, input.projectIds);
    });
  }

  async update(id: string, input: WebhookInput): Promise<Webhook> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(webhooks)
        .set({
          url: input.url,
          secret: input.secret,
          events: input.events,
          active: input.active,
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, id))
        .returning();
      // Replace the whole project set — the form always submits the complete selection.
      await tx.delete(webhookProjects).where(eq(webhookProjects.webhookId, id));
      if (input.projectIds.length > 0) {
        await tx
          .insert(webhookProjects)
          .values(input.projectIds.map((projectId) => ({ webhookId: id, projectId })));
      }
      return toDomain(row, input.projectIds);
    });
  }

  async delete(id: string): Promise<void> {
    await db.delete(webhooks).where(eq(webhooks.id, id));
  }
}
