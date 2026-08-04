import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { users } from "@/infrastructure/db/schema/users";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

function toDomain(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    login: row.login,
    mail: row.mail,
    firstname: row.firstname,
    lastname: row.lastname,
    isAdmin: row.isAdmin,
    status: row.status,
    passwordHash: row.passwordHash,
    passwordSalt: row.passwordSalt,
    mustChangePassword: row.mustChangePassword,
    apiKey: row.apiKey,
    atomKey: row.atomKey,
    authSource: row.authSource,
    twofaScheme: row.twofaScheme,
    twofaTotpKey: row.twofaTotpKey,
    twofaTotpLastUsedStep: row.twofaTotpLastUsedStep,
  };
}

export class DrizzleUserRepository implements UserRepository {
  async listAll(): Promise<User[]> {
    const rows = await db.select().from(users);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(users).where(inArray(users.id, ids));
    return rows.map(toDomain);
  }

  async findByLogin(login: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.login, login)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByAtomKey(atomKey: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.atomKey, atomKey)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByMail(mail: string): Promise<User | null> {
    // Exact case-insensitive equality, not a LIKE pattern match — mail comes from parsed email
    // headers in the mail-handler path, and a sender address containing "%"/"_" must never be
    // treated as a wildcard against other users' addresses.
    const [row] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.mail}) = lower(${mail})`)
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async create(user: Omit<User, "id">): Promise<User> {
    const [row] = await db
      .insert(users)
      .values({
        login: user.login,
        mail: user.mail,
        firstname: user.firstname,
        lastname: user.lastname,
        isAdmin: user.isAdmin,
        status: user.status,
        passwordHash: user.passwordHash,
        passwordSalt: user.passwordSalt,
        mustChangePassword: user.mustChangePassword,
        apiKey: user.apiKey,
        atomKey: user.atomKey,
        authSource: user.authSource,
        twofaScheme: user.twofaScheme,
        twofaTotpKey: user.twofaTotpKey,
        twofaTotpLastUsedStep: user.twofaTotpLastUsedStep,
      })
      .returning();
    return toDomain(row);
  }

  async setAtomKey(userId: string, atomKey: string): Promise<void> {
    await db.update(users).set({ atomKey }).where(eq(users.id, userId));
  }

  async setTotpPairing(userId: string, encryptedKey: string): Promise<void> {
    await db.update(users).set({ twofaTotpKey: encryptedKey }).where(eq(users.id, userId));
  }

  async confirmTotpPairing(userId: string, lastUsedStep: number): Promise<void> {
    await db
      .update(users)
      .set({ twofaScheme: "totp", twofaTotpLastUsedStep: lastUsedStep })
      .where(eq(users.id, userId));
  }

  async updateTwofaLastUsedStep(userId: string, step: number): Promise<void> {
    await db.update(users).set({ twofaTotpLastUsedStep: step }).where(eq(users.id, userId));
  }

  async clearTwofa(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ twofaScheme: null, twofaTotpKey: null, twofaTotpLastUsedStep: null })
      .where(eq(users.id, userId));
  }
}
