import type { TreeEntry } from "./entity";

/**
 * Mercurial has no native "list this directory" command — `hg files` only returns the full,
 * repo-root-relative flat file list. This derives the immediate children of `path` (files and
 * subdirectories, non-recursive) from that flat list, the same shape `git ls-tree`/`svn list`
 * return natively.
 */
export function buildTreeEntries(filePaths: string[], path: string): TreeEntry[] {
  const prefix = path.length > 0 ? `${path}/` : "";
  const seen = new Map<string, TreeEntry>();

  for (const filePath of filePaths) {
    if (!filePath.startsWith(prefix)) continue;
    const remainder = filePath.slice(prefix.length);
    if (remainder.length === 0) continue;

    const slashIndex = remainder.indexOf("/");
    const name = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
    const kind: TreeEntry["kind"] = slashIndex === -1 ? "blob" : "tree";
    if (!seen.has(name)) {
      seen.set(name, { name, path: prefix + name, kind });
    }
  }

  return [...seen.values()];
}
