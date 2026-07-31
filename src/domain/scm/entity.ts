export interface ScmRepository {
  id: string;
  projectId: string;
  /** Absolute path to the repository's working copy on disk — server-controlled, never client input. */
  rootPath: string;
}

export interface TreeEntry {
  name: string;
  path: string;
  kind: "blob" | "tree";
}

export interface Commit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  date: string;
  content: string;
}
