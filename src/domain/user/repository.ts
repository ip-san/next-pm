import type { User } from "./entity";

export interface UserRepository {
  listAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  findByIds(ids: string[]): Promise<User[]>;
  findByLogin(login: string): Promise<User | null>;
  findByApiKey(apiKey: string): Promise<User | null>;
  findByAtomKey(atomKey: string): Promise<User | null>;
  /** Case-insensitive — mirrors Redmine's User.find_by_mail. */
  findByMail(mail: string): Promise<User | null>;
  create(user: Omit<User, "id">): Promise<User>;
  /** Lazily assigns a feed token — only ever called when the user doesn't already have one. */
  setAtomKey(userId: string, atomKey: string): Promise<void>;
  /** Stores an as-yet-unconfirmed pairing's encrypted secret. Does not activate twofaScheme. */
  setTotpPairing(userId: string, encryptedKey: string): Promise<void>;
  /** Activates 2FA on a confirmed pairing, seeding the anti-replay floor with the step that confirmed it. */
  confirmTotpPairing(userId: string, lastUsedStep: number): Promise<void>;
  /** Persists the new anti-replay floor after a successful login-time TOTP verification. */
  updateTwofaLastUsedStep(userId: string, step: number): Promise<void>;
  /** Fully removes 2FA (scheme, secret, replay floor) — callers must also clear backup codes separately. */
  clearTwofa(userId: string): Promise<void>;
}
