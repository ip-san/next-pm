import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { users } from "@/infrastructure/db/schema/users";
import { emailAddresses } from "@/infrastructure/db/schema/email-addresses";
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
    language: row.language,
    mailNotification: row.mailNotification,
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

  /**
   * Mirrors Redmine's User.find_by_login exactly, including its two-step shape: an exact match
   * wins, and only if there is none does it fall back to a case-insensitive one.
   *
   * The case-insensitive fallback is not cosmetic. Redmine validates login uniqueness with
   * `:case_sensitive => false`, so "Admin" and "admin" are the same account there. Matching
   * case-sensitively only would let a registrant (or LDAP on-the-fly creation) claim "Admin"
   * alongside an existing "admin" and impersonate them to anyone reading a name.
   */
  async findByLogin(login: string): Promise<User | null> {
    const [exact] = await db.select().from(users).where(eq(users.login, login)).limit(1);
    if (exact) {
      return toDomain(exact);
    }
    const [insensitive] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.login}) = lower(${login})`)
      .limit(1);
    return insensitive ? toDomain(insensitive) : null;
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.apiKey, apiKey)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByAtomKey(atomKey: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.atomKey, atomKey)).limit(1);
    return row ? toDomain(row) : null;
  }

  /**
   * Mirrors Redmine's User.find_by_mail, which is `having_mail(...).first` over the whole
   * email_addresses table — so an additional address matches just as the default one does.
   * next-pm keeps the default address on users.mail (see schema/email-addresses.ts), so this
   * searches both: the default first, then the additional ones.
   *
   * Searching both is what keeps the single callers correct everywhere at once — lost-password
   * delivery, mail-handler sender matching and every uniqueness check — rather than each one
   * having to remember the second table exists.
   */
  async findByMail(mail: string): Promise<User | null> {
    // Exact case-insensitive equality, not a LIKE pattern match — mail comes from parsed email
    // headers in the mail-handler path, and a sender address containing "%"/"_" must never be
    // treated as a wildcard against other users' addresses.
    const [row] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.mail}) = lower(${mail})`)
      .limit(1);
    if (row) {
      return toDomain(row);
    }

    const [viaAdditional] = await db
      .select({ user: users })
      .from(emailAddresses)
      .innerJoin(users, eq(users.id, emailAddresses.userId))
      .where(sql`lower(${emailAddresses.address}) = lower(${mail})`)
      .limit(1);
    return viaAdditional ? toDomain(viaAdditional.user) : null;
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
        language: user.language,
        mailNotification: user.mailNotification,
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

  async updateStatus(userId: string, status: User["status"]): Promise<void> {
    await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateProfile(
    userId: string,
    values: Pick<User, "firstname" | "lastname" | "language" | "mailNotification">,
  ): Promise<void> {
    await db.update(users).set({ ...values, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async updateMail(userId: string, mail: string): Promise<void> {
    await db.update(users).set({ mail, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async setAtomKey(userId: string, atomKey: string): Promise<void> {
    await db.update(users).set({ atomKey }).where(eq(users.id, userId));
  }

  async setApiKey(userId: string, apiKey: string): Promise<void> {
    await db.update(users).set({ apiKey }).where(eq(users.id, userId));
  }

  async updatePassword(userId: string, passwordHash: string, passwordSalt: string): Promise<void> {
    await db.update(users).set({ passwordHash, passwordSalt, mustChangePassword: false }).where(eq(users.id, userId));
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
