import type { UserSession } from "./entity";

export interface UserSessionRepository {
  create(userId: string): Promise<UserSession>;
  findById(id: string): Promise<UserSession | null>;
  touch(id: string, at: Date): Promise<void>;
  delete(id: string): Promise<void>;
  /** Redmine's User#destroy_tokens — every device loses its session on a password change or a lock. */
  deleteForUser(userId: string): Promise<void>;
}
