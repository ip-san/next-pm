import type { BlameLine, Commit, TreeEntry } from "./entity";

/**
 * One implementation per vendor (git/subversion/mercurial) — see infrastructure/scm/
 * browser-for-vendor.ts for the factory that picks the right one for a given ScmRepository.
 * `ref` is always "HEAD" for "the latest revision", regardless of vendor: git and Subversion
 * both understand that literally, so only the Mercurial adapter needs to translate it (to
 * "tip") before shelling out.
 */
export interface ScmBrowser {
  listTree(rootPath: string, ref: string, path: string): Promise<TreeEntry[]>;
  readFile(rootPath: string, ref: string, path: string): Promise<string>;
  log(rootPath: string, ref: string, limit: number): Promise<Commit[]>;
  /** Raw unified diff for a single commit/changeset, as `git show`/`svn diff`/`hg diff -c` would print it. */
  diff(rootPath: string, ref: string): Promise<string>;
  blame(rootPath: string, ref: string, path: string): Promise<BlameLine[]>;
}
