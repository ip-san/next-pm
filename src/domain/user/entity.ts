/**
 * Mirrors Redmine's User::STATUS_* set. "anonymous" belongs to the single AnonymousUser row
 * that owns the records of deleted users (see User#remove_references_before_destroy) — it is
 * never a login target and never appears in a user listing.
 */
export type UserStatus = "active" | "registered" | "locked" | "anonymous";

/** The login Redmine gives its AnonymousUser; the create form's min-length rule keeps it unreachable. */
export const ANONYMOUS_USER_LOGIN = "";

export interface User {
  id: string;
  login: string;
  mail: string;
  firstname: string;
  lastname: string;
  isAdmin: boolean;
  status: UserStatus;
  passwordHash: string;
  passwordSalt: string;
  mustChangePassword: boolean;
  apiKey: string | null;
  /** Separate from apiKey — scoped to feed URLs only, so a leaked feed link can't grant full API access. */
  atomKey: string | null;
  /** Null for a locally-authenticated user; "ldap" delegates password checks to LDAP on every login. */
  authSource: "ldap" | null;
  /** Null until a TOTP pairing is confirmed. */
  twofaScheme: "totp" | null;
  /** AES-256-GCM ciphertext (domain/crypto/symmetric.ts) of the base32 TOTP secret — never plaintext. */
  twofaTotpKey: string | null;
  /** Anti-replay floor: the TOTP step number last accepted. Null before first successful verification. */
  twofaTotpLastUsedStep: number | null;
}

export function isTwofaActive(user: Pick<User, "twofaScheme">): boolean {
  return user.twofaScheme !== null;
}

export function isActiveUser(user: Pick<User, "status">): boolean {
  return user.status === "active";
}

/** Redmine's AnonymousUser — the placeholder principal that inherits a deleted user's records. */
export function isAnonymousUser(user: Pick<User, "status">): boolean {
  return user.status === "anonymous";
}
