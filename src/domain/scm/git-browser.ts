import type { Commit, TreeEntry } from "./entity";

export interface GitBrowser {
  listTree(rootPath: string, ref: string, path: string): Promise<TreeEntry[]>;
  readFile(rootPath: string, ref: string, path: string): Promise<string>;
  log(rootPath: string, ref: string, limit: number): Promise<Commit[]>;
}
