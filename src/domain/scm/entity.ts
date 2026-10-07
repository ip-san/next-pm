/** Mirrors the subset of Redmine's Repository subclasses (Repository::Subversion/Mercurial/Git — CVS/Bazaar/Filesystem out of scope) that have a real adapter — see infrastructure/scm/browser-for-vendor.ts. */
export type ScmVendor = "git" | "subversion" | "mercurial";

export interface ScmRepository {
  id: string;
  projectId: string;
  /**
   * Redmine's Repository#identifier — the URL-safe name separating one of a project's
   * repositories from the next. Empty string for the (at most one per project) unnamed
   * repository, which is then only reachable at the project's default-repository path or by
   * id — see identifier.ts.
   */
  identifier: string;
  /** Redmine's Repository#is_default — the one repository served at `/projects/:id/repository`. */
  isDefault: boolean;
  vendor: ScmVendor;
  /**
   * Server-controlled, never client input. For git/mercurial, an absolute filesystem path to
   * the repository. For subversion, a repository URL (file://, http://, https://, svn://, or
   * svn+ssh://) — Subversion is centralized, so browsing it never needs a local checkout.
   */
  rootPath: string;
  /** Commits committed before this are ingested but never trigger fix/time-log actions — see schema/scm-repositories.ts. */
  createdAt: Date;
}

export interface TreeEntry {
  name: string;
  path: string;
  kind: "blob" | "tree";
}

export interface Commit {
  hash: string;
  author: string;
  /** Empty string when the commit has no configured author email (git allows this). */
  authorEmail: string;
  date: string;
  /** Full commit message (subject + body), not just the subject line — keyword scanning needs the body. */
  message: string;
}

export interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  date: string;
  content: string;
}

export interface Changeset {
  id: string;
  scmRepositoryId: string;
  revision: string;
  /** Raw committer identity as reported by the SCM (e.g. "Alice <alice@example.com>" or just a name). */
  committerIdentity: string;
  /**
   * The next-pm user this commit is attributed to, or null when the committer matches nobody.
   * Resolved on ingest and re-pointed in bulk when an admin edits the repository's committer
   * mapping — see domain/scm/committer.ts and application/scm/map-committers.ts.
   */
  userId: string | null;
  committedOn: Date;
  comments: string;
  createdAt: Date;
}
