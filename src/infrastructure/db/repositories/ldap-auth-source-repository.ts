import { asc, count, eq } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { ldapAuthSources } from "@/infrastructure/db/schema/ldap-auth-sources";
import { users } from "@/infrastructure/db/schema/users";
import type { LdapAuthSource, LdapAuthSourceInput } from "@/domain/ldap/auth-source";
import type { LdapAuthSourceRepository } from "@/domain/ldap/repository";

type Row = typeof ldapAuthSources.$inferSelect;

function toDomain(row: Row): LdapAuthSource {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    account: row.account,
    hasAccountPassword: row.accountPasswordEncrypted !== null,
    baseDn: row.baseDn,
    attrLogin: row.attrLogin,
    attrFirstname: row.attrFirstname,
    attrLastname: row.attrLastname,
    attrMail: row.attrMail,
    tls: row.tls,
    verifyPeer: row.verifyPeer,
    onthefly: row.onthefly,
    filter: row.filter,
  };
}

/** The columns an input writes; the password column is handled by the caller (see update). */
function columnsFor(input: LdapAuthSourceInput) {
  return {
    name: input.name.trim(),
    host: input.host.trim(),
    port: input.port,
    account: input.account?.trim() || null,
    baseDn: input.baseDn.trim(),
    attrLogin: input.attrLogin.trim(),
    attrFirstname: input.attrFirstname.trim(),
    attrLastname: input.attrLastname.trim(),
    attrMail: input.attrMail.trim(),
    tls: input.tls,
    verifyPeer: input.verifyPeer,
    onthefly: input.onthefly,
    filter: input.filter?.trim() || null,
  };
}

export class DrizzleLdapAuthSourceRepository implements LdapAuthSourceRepository {
  async listAll(): Promise<LdapAuthSource[]> {
    const rows = await db.select().from(ldapAuthSources).orderBy(asc(ldapAuthSources.name));
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<LdapAuthSource | null> {
    const [row] = await db.select().from(ldapAuthSources).where(eq(ldapAuthSources.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async create(input: LdapAuthSourceInput, encryptedPassword: string | null): Promise<LdapAuthSource> {
    const [row] = await db
      .insert(ldapAuthSources)
      .values({ ...columnsFor(input), accountPasswordEncrypted: encryptedPassword })
      .returning();
    return toDomain(row);
  }

  async update(id: string, input: LdapAuthSourceInput, encryptedPassword: string | null | undefined): Promise<LdapAuthSource> {
    const [row] = await db
      .update(ldapAuthSources)
      .set({
        ...columnsFor(input),
        ...(encryptedPassword !== undefined ? { accountPasswordEncrypted: encryptedPassword } : {}),
        updatedAt: new Date(),
      })
      .where(eq(ldapAuthSources.id, id))
      .returning();
    return toDomain(row);
  }

  async listWithEncryptedPasswords(): Promise<{ source: LdapAuthSource; encryptedPassword: string | null }[]> {
    const rows = await db.select().from(ldapAuthSources).orderBy(asc(ldapAuthSources.name));
    return rows.map((row) => ({ source: toDomain(row), encryptedPassword: row.accountPasswordEncrypted }));
  }

  async countUsers(id: string): Promise<number> {
    const [row] = await db.select({ total: count() }).from(users).where(eq(users.ldapAuthSourceId, id));
    return row?.total ?? 0;
  }

  async delete(id: string): Promise<void> {
    await db.delete(ldapAuthSources).where(eq(ldapAuthSources.id, id));
  }
}
