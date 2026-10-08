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
import { emailAddresses } from "@/infrastructure/db/schema/email-addresses";
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

  /**
   * The columns the users CSV export needs, including created_at (the domain User doesn't carry it).
   * Same listing rule as listAll: the AnonymousUser placeholder is excluded.
   */
  async listForCsvExport(): Promise<{
    login: string;
    firstname: string;
    lastname: string;
    mail: string;
    isAdmin: boolean;
    status: UserStatus;
    createdAt: Date;
  }[]> {
    return db
      .select({
        login: users.login,
        firstname: users.firstname,
        lastname: users.lastname,
        mail: users.mail,
        isAdmin: users.isAdmin,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(ne(users.status, "anonymous"))
      .orderBy(users.login, users.id);
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

  // updateStatus is further down, in the UserAdminRepository half: both ports declare the
  // same signature, so one implementation satisfies them structurally and a second copy here
  // would just be two ways to write the same column.

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
      // Redmine updates journals.updated_by_id alongside user_id. It was missing here, and it
      // is a RESTRICT foreign key: deleting anyone who had ever *edited* a note — their own or,
      // with edit_issue_notes, somebody else's — failed on the constraint.
      await tx.update(journals).set({ updatedById: toUserId }).where(eq(journals.updatedById, fromUserId));
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
