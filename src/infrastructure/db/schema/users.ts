import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { MAIL_NOTIFICATION_OPTIONS } from "@/domain/notification/mail-notification";
import { ldapAuthSources } from "./ldap-auth-sources";

/**
 * Mirrors Redmine's User::STATUS_* set. "anonymous" is the single AnonymousUser row Redmine
 * keeps to own records whose author has been deleted (User#remove_references_before_destroy);
 * it never logs in and is filtered out of every user listing.
 */
export const userStatusEnum = ["active", "registered", "locked", "anonymous"] as const;

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  login: text("login").notNull().unique(),
  mail: text("mail").notNull().unique(),
  firstname: text("firstname").notNull(),
  lastname: text("lastname").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  /**
   * Redmine stores the user's locale here. next-pm has no i18n framework (§0.1 of the parity
   * checklist), so nothing reads it yet — it is stored so the my-account form round-trips the
   * field, as Redmine's does, rather than silently discarding a choice the user made.
   */
  language: text("language"),
  /** Redmine users.mail_notification — how much mail this account wants. See domain/notification/mail-notification.ts. */
  mailNotification: text("mail_notification", { enum: MAIL_NOTIFICATION_OPTIONS }).notNull().default("all"),
  status: text("status", { enum: userStatusEnum }).notNull().default("registered"),
  /**
   * Empty string for an LDAP-backed user (see authSource) — safe by construction, not just by
   * convention: verifyPassword compares buffer lengths before content, and Buffer.from("", "hex")
   * is zero-length against a real 64-byte scrypt digest, so it can never match any password.
   */
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  apiKey: text("api_key").unique(),
  /**
   * A separate token from apiKey, deliberately — this one gets embedded in feed URLs (query
   * strings end up in server logs, browser history, proxy caches), so a leak of it must only
   * expose read-only feed content, never the full REST API access apiKey grants.
   */
  atomKey: text("atom_key").unique(),
  /** Null for a locally-authenticated user; "ldap" delegates password checks to LDAP on every login. */
  authSource: text("auth_source", { enum: ["ldap"] }),
  /**
   * The admin-managed LDAP source that created this account (Redmine's auth_source_id). Null with authSource "ldap" means
   * the environment-configured source. A user is only ever checked against the source that created them.
   */
  ldapAuthSourceId: uuid("ldap_auth_source_id").references(() => ldapAuthSources.id, { onDelete: "restrict" }),
  /** Null until a pairing is confirmed — see application/twofa/pairing.ts. Only "totp" exists for now. */
  twofaScheme: text("twofa_scheme", { enum: ["totp"] }),
  /**
   * AES-256-GCM ciphertext of the base32 TOTP secret (domain/crypto/symmetric.ts), never
   * plaintext — unlike Redmine, which silently stores this column in plaintext if its
   * database_cipher_key setting is left unconfigured. Set as soon as pairing starts (before
   * twofaScheme is set), so an unconfirmed pairing attempt still occupies this column.
   */
  twofaTotpKey: text("twofa_totp_key"),
  /** Anti-replay floor — the TOTP step number last accepted for this user. Null before first use. */
  twofaTotpLastUsedStep: integer("twofa_totp_last_used_step"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
