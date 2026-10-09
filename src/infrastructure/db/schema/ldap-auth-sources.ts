import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Redmine's AuthSourceLdap: an LDAP directory users can sign in through. The bind password is stored encrypted
 * (with the TOTP encryption key, the same cipher as the TOTP secrets), never in clear.
 */
export const ldapAuthSources = pgTable("ldap_auth_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(389),
  account: text("account"),
  accountPasswordEncrypted: text("account_password_encrypted"),
  baseDn: text("base_dn").notNull().default(""),
  attrLogin: text("attr_login").notNull().default("uid"),
  attrFirstname: text("attr_firstname").notNull().default("givenName"),
  attrLastname: text("attr_lastname").notNull().default("sn"),
  attrMail: text("attr_mail").notNull().default("mail"),
  tls: boolean("tls").notNull().default(false),
  verifyPeer: boolean("verify_peer").notNull().default(true),
  /** Create a Redmine account on first successful sign-in, as Redmine's onthefly_register does. */
  onthefly: boolean("onthefly").notNull().default(false),
  /** An extra LDAP filter that every matching entry must also satisfy, or null for none. */
  filter: text("filter"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
