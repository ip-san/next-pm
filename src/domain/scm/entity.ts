export interface ScmRepository {
  id: string;
  projectId: string;
  /** Absolute path to the repository's working copy on disk — server-controlled, never client input. */
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
