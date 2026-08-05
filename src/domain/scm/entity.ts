/** Mirrors the subset of Redmine's Repository subclasses (Repository::Subversion/Mercurial/Git — CVS/Bazaar/Filesystem out of scope) that have a real adapter — see infrastructure/scm/browser-for-vendor.ts. */
export type ScmVendor = "git" | "subversion" | "mercurial";

export interface ScmRepository {
  id: string;
  projectId: string;
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
  committedOn: Date;
  comments: string;
  createdAt: Date;
}
