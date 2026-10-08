/** Mirrors Redmine's Repository::IDENTIFIER_MAX_LENGTH. */
export const SCM_REPOSITORY_IDENTIFIER_MAX_LENGTH = 255;

/**
 * Redmine's `validates_format_of :identifier` — lowercase letters, digits, dashes and
 * underscores, but never digits only (an all-digit identifier would be indistinguishable from
 * the numeric repository id Redmine's `find_by_identifier_param` falls back to). next-pm keys
 * repositories by UUID rather than a serial, so the all-digit case can't actually collide here,
 * but the rule is kept so identifiers stay portable to and from a real Redmine.
 */
export const SCM_REPOSITORY_IDENTIFIER_PATTERN = /^(?!\d+$)[a-z0-9\-_]*$/;

/**
 * Redmine's `validates_exclusion_of :identifier` list — the names its own repository routes
 * occupy — plus `blame`, which next-pm uses as a static segment under
 * `/projects/:identifier/repository/...` where Redmine uses `annotate`. Without this an
 * identifier could shadow a real route: Next.js resolves a static segment before a dynamic
 * one, so a repository called "blame" would simply be unreachable.
 */
export const RESERVED_SCM_REPOSITORY_IDENTIFIERS = [
  "annotate",
  "blame",
  "browse",
  "changes",
  "diff",
  "entry",
  "graph",
  "raw",
  "revision",
  "revisions",
  "show",
  "statistics",
] as const;

export type ScmRepositoryIdentifierProblem = "too_long" | "malformed" | "reserved";

/** Redmine's `before_validation :normalize_identifier` (`identifier.to_s.strip`). */
export function normalizeScmRepositoryIdentifier(raw: string): string {
  return raw.trim();
}

/**
 * Validates an already-normalized identifier. A blank identifier is valid (Redmine's
 * `allow_blank`) — the unnamed repository. Uniqueness within the project is NOT checked here
 * because it needs the sibling repositories; the use case does that.
 */
export function validateScmRepositoryIdentifier(identifier: string): ScmRepositoryIdentifierProblem | null {
  if (identifier.length === 0) return null;
  if (identifier.length > SCM_REPOSITORY_IDENTIFIER_MAX_LENGTH) return "too_long";
  if (!SCM_REPOSITORY_IDENTIFIER_PATTERN.test(identifier)) return "malformed";
  if ((RESERVED_SCM_REPOSITORY_IDENTIFIERS as readonly string[]).includes(identifier)) return "reserved";
  return null;
}

/**
 * Redmine's `identifier_frozen?` — once a repository is saved with a non-blank identifier the
 * setter silently ignores further writes, because the identifier is part of every URL and of
 * every `%repo%` reference people have already linked to. A repository saved *without* one can
 * still be named later.
 */
export function isScmRepositoryIdentifierFrozen(persistedIdentifier: string): boolean {
  return persistedIdentifier.length > 0;
}

/**
 * Redmine's `Repository#identifier_param` — what goes in the URL for a non-default repository.
 * Redmine falls back to the numeric id; next-pm falls back to the UUID for the same reason (an
 * unnamed, non-default repository still needs an addressable path).
 */
export function scmRepositoryIdentifierParam(repository: { id: string; identifier: string }): string {
  return repository.identifier.length > 0 ? repository.identifier : repository.id;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Redmine's `Repository.find_by_identifier_param`, which branches on `/^\d+$/` because its
 * fallback key is a serial id. next-pm's fallback key is a UUID, and the identifier format
 * above can never produce one (UUIDs contain hyphens in fixed positions but, more decisively,
 * `find_by_identifier` is tried first here only when the param isn't a UUID), so the two
 * namespaces stay disjoint.
 */
export function resolveScmRepositoryByParam<T extends { id: string; identifier: string }>(
  repositories: T[],
  param: string,
): T | null {
  if (UUID_PATTERN.test(param)) {
    return repositories.find((repository) => repository.id === param) ?? null;
  }
  return repositories.find((repository) => repository.identifier === param) ?? null;
}

/**
 * Redmine's `Repository#<=>`: the default repository first, the rest by identifier. Used
 * wherever a project's repositories are listed, so the ordering a user sees never depends on
 * insertion order.
 */
export function compareScmRepositories(a: { identifier: string; isDefault: boolean }, b: { identifier: string; isDefault: boolean }): number {
  if (a.isDefault && !b.isDefault) return -1;
  if (b.isDefault && !a.isDefault) return 1;
  return a.identifier.localeCompare(b.identifier);
}
