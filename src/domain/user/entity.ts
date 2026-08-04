export type UserStatus = "active" | "registered" | "locked";

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
