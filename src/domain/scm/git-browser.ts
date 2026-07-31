import type { BlameLine, Commit, TreeEntry } from "./entity";

export interface GitBrowser {
  listTree(rootPath: string, ref: string, path: string): Promise<TreeEntry[]>;
  readFile(rootPath: string, ref: string, path: string): Promise<string>;
  log(rootPath: string, ref: string, limit: number): Promise<Commit[]>;
  /** Raw unified diff for a single commit, as `git show` would print it. */
  diff(rootPath: string, ref: string): Promise<string>;
  blame(rootPath: string, ref: string, path: string): Promise<BlameLine[]>;
}
