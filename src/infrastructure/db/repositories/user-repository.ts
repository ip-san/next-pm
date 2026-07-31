import { eq, inArray } from "drizzle-orm";
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
  };
}

export class DrizzleUserRepository implements UserRepository {
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
      })
      .returning();
    return toDomain(row);
  }
}
