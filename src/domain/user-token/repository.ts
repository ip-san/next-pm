import type { UserToken, UserTokenAction } from "./entity";

export interface UserTokenRepository {
  create(userId: string, action: UserTokenAction, tokenHash: string, expiresAt: Date): Promise<UserToken>;
  findByTokenHash(action: UserTokenAction, tokenHash: string): Promise<UserToken | null>;
  delete(id: string): Promise<void>;
  /** Scoped to one action so revoking remember-me cookies doesn't also void a pending activation link. */
  deleteForUser(userId: string, action: UserTokenAction): Promise<void>;
}
