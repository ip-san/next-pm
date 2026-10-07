import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { attachments } from "@/infrastructure/db/schema/attachments";
import { issueCategories } from "@/infrastructure/db/schema/issue-categories";
import { issues } from "@/infrastructure/db/schema/issues";
import { journalDetails, journals } from "@/infrastructure/db/schema/journals";
import { messages } from "@/infrastructure/db/schema/messages";
import { news, newsComments } from "@/infrastructure/db/schema/news";
import { queries } from "@/infrastructure/db/schema/queries";
import { timeEntries } from "@/infrastructure/db/schema/time-entries";
import { users } from "@/infrastructure/db/schema/users";
import { wikiContentVersions } from "@/infrastructure/db/schema/wiki";
import { ANONYMOUS_USER_LOGIN, type User, type UserStatus } from "@/domain/user/entity";
import type { UserAdminRepository, UserRepository } from "@/domain/user/repository";

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

export class DrizzleUserRepository implements UserRepository, UserAdminRepository {
  async listAll(): Promise<User[]> {
    // The AnonymousUser placeholder is not an account — Redmine's `User.logged` scope excludes
    // it from every listing, and so must this one (admin list, REST /users, pickers).
    const rows = await db
      .select()
      .from(users)
      .where(ne(users.status, "anonymous"))
      .orderBy(users.login, users.id);
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

  async update(
    id: string,
    changes: Pick<User, "login" | "mail" | "firstname" | "lastname" | "isAdmin" | "authSource">,
  ): Promise<User> {
    const [row] = await db
      .update(users)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return toDomain(row);
  }

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async findOrCreateAnonymous(): Promise<User> {
    const [existing] = await db.select().from(users).where(eq(users.status, "anonymous")).limit(1);
    if (existing) return toDomain(existing);

    // login and mail are unique and not-null, so the placeholder still needs values; the empty
    // login is Redmine's own choice and no create form can produce it (min length 1).
    const [row] = await db
      .insert(users)
      .values({
        login: ANONYMOUS_USER_LOGIN,
        mail: "anonymous@localhost",
        firstname: "",
        lastname: "Anonymous",
        isAdmin: false,
        status: "anonymous",
        passwordHash: "",
        passwordSalt: "",
        mustChangePassword: false,
      })
      .returning();
    return toDomain(row);
  }

  async reassignReferencesAndDelete(fromUserId: string, toUserId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Authored content survives its author, reassigned to the anonymous placeholder.
      await tx.update(issues).set({ authorId: toUserId }).where(eq(issues.authorId, fromUserId));
      await tx.update(journals).set({ userId: toUserId }).where(eq(journals.userId, fromUserId));
      await tx.update(attachments).set({ authorId: toUserId }).where(eq(attachments.authorId, fromUserId));
      await tx.update(news).set({ authorId: toUserId }).where(eq(news.authorId, fromUserId));
      await tx.update(newsComments).set({ authorId: toUserId }).where(eq(newsComments.authorId, fromUserId));
      await tx.update(messages).set({ authorId: toUserId }).where(eq(messages.authorId, fromUserId));
      await tx
        .update(wikiContentVersions)
        .set({ authorId: toUserId })
        .where(eq(wikiContentVersions.authorId, fromUserId));
      await tx.update(timeEntries).set({ userId: toUserId }).where(eq(timeEntries.userId, fromUserId));
      // Redmine's list only names TimeEntry#user_id because its author_id column is nullable;
      // here it is NOT NULL, so it has to move too or the delete would fail on the FK.
      await tx.update(timeEntries).set({ authorId: toUserId }).where(eq(timeEntries.authorId, fromUserId));

      // Assignments are cleared rather than handed to the placeholder.
      await tx
        .update(issues)
        .set({ assignedToId: null, assignedToType: null })
        .where(and(eq(issues.assignedToId, fromUserId), eq(issues.assignedToType, "user")));
      await tx
        .update(issueCategories)
        .set({ assignedToId: null })
        .where(eq(issueCategories.assignedToId, fromUserId));

      // Journal details recording an assignee change would otherwise keep pointing at an id
      // that no longer resolves to anything (Redmine rewrites the same two columns).
      await tx
        .update(journalDetails)
        .set({ oldValue: toUserId })
        .where(
          and(
            eq(journalDetails.property, "attr"),
            eq(journalDetails.fieldName, "assignedToId"),
            eq(journalDetails.oldValue, fromUserId),
          ),
        );
      await tx
        .update(journalDetails)
        .set({ newValue: toUserId })
        .where(
          and(
            eq(journalDetails.property, "attr"),
            eq(journalDetails.fieldName, "assignedToId"),
            eq(journalDetails.newValue, fromUserId),
          ),
        );

      // Private queries are personal and go; shared ones survive under the placeholder.
      await tx.delete(queries).where(and(eq(queries.userId, fromUserId), eq(queries.visibility, "private")));
      await tx.update(queries).set({ userId: toUserId }).where(eq(queries.userId, fromUserId));

      // Everything else referencing the user (watchers, preferences, my-page layout, reactions,
      // group memberships, project memberships, 2FA backup codes, password-reset tokens)
      // cascades on the delete below, matching the `dependent: :destroy` associations Redmine
      // declares. The delete shares this transaction so a failure can never leave an account
      // that has lost its authorship but survives.
      await tx.delete(users).where(eq(users.id, fromUserId));
    });
  }
}
