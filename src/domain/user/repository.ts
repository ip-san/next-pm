import type { User, UserStatus } from "./entity";

export interface UserRepository {
  /** Every real account — the AnonymousUser placeholder is excluded, like Redmine's `User.logged`. */
  listAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  findByIds(ids: string[]): Promise<User[]>;
  findByLogin(login: string): Promise<User | null>;
  findByApiKey(apiKey: string): Promise<User | null>;
  findByAtomKey(atomKey: string): Promise<User | null>;
  /** Case-insensitive — mirrors Redmine's User.find_by_mail. */
  findByMail(mail: string): Promise<User | null>;
  create(user: Omit<User, "id">): Promise<User>;
  /**
   * Persists a new password hash/salt and unconditionally clears mustChangePassword — mirrors
   * Redmine's Account#change_password, which always resets the forced-change flag on a
   * successful change regardless of why it was set.
   */
  updatePassword(userId: string, passwordHash: string, passwordSalt: string): Promise<void>;
  /** Redmine's User#activate! / #register! / #lock! — the whole of what those do is set this column. */
  updateStatus(userId: string, status: UserStatus): Promise<void>;
  /** The my-account form's own fields. Deliberately excludes login, status and isAdmin, which it may not touch. */
  updateProfile(userId: string, values: Pick<User, "firstname" | "lastname" | "language" | "mailNotification">): Promise<void>;
  /** Changing the default address; the caller owns the uniqueness check and the security notification. */
  updateMail(userId: string, mail: string): Promise<void>;
  /** Lazily assigns a feed token — only ever called when the user doesn't already have one. */
  setAtomKey(userId: string, atomKey: string): Promise<void>;
  /** Issues or replaces the REST API key. Until the my-account screen existed, nothing ever wrote this column. */
  setApiKey(userId: string, apiKey: string): Promise<void>;
  /** Stores an as-yet-unconfirmed pairing's encrypted secret. Does not activate twofaScheme. */
  setTotpPairing(userId: string, encryptedKey: string): Promise<void>;
  /** Activates 2FA on a confirmed pairing, seeding the anti-replay floor with the step that confirmed it. */
  confirmTotpPairing(userId: string, lastUsedStep: number): Promise<void>;
  /** Persists the new anti-replay floor after a successful login-time TOTP verification. */
  updateTwofaLastUsedStep(userId: string, step: number): Promise<void>;
  /** Fully removes 2FA (scheme, secret, replay floor) — callers must also clear backup codes separately. */
  clearTwofa(userId: string): Promise<void>;
}

/** Admin-screen writes — see IssueStatusAdminRepository for why these sit apart. */
export interface UserAdminRepository {
  update(
    id: string,
    changes: Pick<User, "login" | "mail" | "firstname" | "lastname" | "isAdmin" | "authSource">,
  ): Promise<User>;
  /** Mirrors User#activate! / #lock! / #register! — a plain status write with no other side effect. */
  updateStatus(id: string, status: UserStatus): Promise<void>;
  /**
   * Mirrors `User.anonymous`, which finds the AnonymousUser row or creates it on the fly.
   * Doing it lazily rather than from the seed keeps existing databases working untouched.
   */
  findOrCreateAnonymous(): Promise<User>;
  /**
   * Mirrors User#destroy together with its before_destroy hook
   * (User#remove_references_before_destroy): everything the deleted user authored moves to
   * `toUserId`, assignments are cleared, the purely personal rows (watches, private queries,
   * preferences, tokens) are discarded, and only then is the account row removed.
   *
   * Reassignment and removal are one transaction on purpose — the FKs from authored content are
   * RESTRICT, so a partial run would leave an account that has already lost its authorship and
   * can still never be deleted.
   */
  reassignReferencesAndDelete(fromUserId: string, toUserId: string): Promise<void>;
}
