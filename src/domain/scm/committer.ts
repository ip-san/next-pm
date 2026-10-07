export interface ParsedCommitterIdentity {
  /** The part before `<`, trimmed. Matched against user logins. */
  username: string;
  /** The text inside `<>`, or null when the committer string carries no angle brackets. */
  email: string | null;
}

/**
 * Splits an SCM committer string the way Redmine's `Repository#find_committer_user` does, with
 * the same regex: `/^([^<]+)(<(.*)>)?$/` against the stripped string.
 *
 * Consequences of that exact shape, all deliberate:
 * - "Alice Dev <alice@example.com>" → username "Alice Dev", email "alice@example.com".
 * - "alice" → username "alice", email null (a bare Subversion/Mercurial username).
 * - "<alice@example.com>" → no match at all, because `[^<]+` needs at least one character
 *   before the bracket. Redmine resolves such a committer to nobody, and so does this.
 */
export function parseCommitterIdentity(committer: string): ParsedCommitterIdentity | null {
  const match = /^([^<]+)(<(.*)>)?$/.exec(committer.trim());
  if (!match) return null;
  const email = match[3]?.trim() ?? "";
  return { username: match[1].trim(), email: email.length > 0 ? email : null };
}

/** One row of the repository's committer mapping screen: a distinct committer string and who it currently points at. */
export interface CommitterMapping {
  committerIdentity: string;
  userId: string | null;
}
