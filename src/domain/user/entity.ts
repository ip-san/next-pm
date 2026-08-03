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
}

export function isActiveUser(user: Pick<User, "status">): boolean {
  return user.status === "active";
}
