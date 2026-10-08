import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { emailAddresses } from "@/infrastructure/db/schema/email-addresses";
import type { EmailAddress } from "@/domain/email-address/entity";
import type { EmailAddressRepository } from "@/domain/email-address/repository";

function toDomain(row: typeof emailAddresses.$inferSelect): EmailAddress {
  return {
    id: row.id,
    userId: row.userId,
    address: row.address,
    notify: row.notify,
    createdAt: row.createdAt,
  };
}

export class DrizzleEmailAddressRepository implements EmailAddressRepository {
  async listForUser(userId: string): Promise<EmailAddress[]> {
    // Redmine's EmailAddressesController#index orders by id; createdAt is the stable
    // equivalent here, since these ids are random UUIDs rather than a sequence.
    const rows = await db
      .select()
      .from(emailAddresses)
      .where(eq(emailAddresses.userId, userId))
      .orderBy(asc(emailAddresses.createdAt));
    return rows.map(toDomain);
  }

  async listForUsers(userIds: string[]): Promise<EmailAddress[]> {
    if (userIds.length === 0) return [];
    const rows = await db.select().from(emailAddresses).where(inArray(emailAddresses.userId, userIds));
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<EmailAddress | null> {
    const [row] = await db.select().from(emailAddresses).where(eq(emailAddresses.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByAddress(address: string): Promise<EmailAddress | null> {
    const [row] = await db
      .select()
      .from(emailAddresses)
      .where(sql`lower(${emailAddresses.address}) = lower(${address})`)
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async create(userId: string, address: string): Promise<EmailAddress> {
    const [row] = await db.insert(emailAddresses).values({ userId, address }).returning();
    return toDomain(row);
  }

  async setNotify(id: string, notify: boolean): Promise<void> {
    await db.update(emailAddresses).set({ notify, updatedAt: new Date() }).where(eq(emailAddresses.id, id));
  }

  async delete(id: string): Promise<void> {
    await db.delete(emailAddresses).where(eq(emailAddresses.id, id));
  }
}
