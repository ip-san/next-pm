import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BlameLine, Commit, TreeEntry } from "@/domain/scm/entity";
import { parseSvnLog } from "@/domain/scm/parse-svn-log";
import type { ScmBrowser } from "@/domain/scm/scm-browser";
import { validateRef, validateRepositoryPath } from "@/domain/scm/validate-path";

const execFileAsync = promisify(execFile);

// Subversion's `blame` output has no date column (unlike `git blame --line-porcelain` and
// `hg annotate --template`), and getting one would mean a second `svn log` round trip to map
// each distinct revision back to a timestamp — not worth it for a field the UI only displays
// alongside the revision/author, so blame lines report an empty date for this vendor only.
const NO_DATE = "";

function target(rootPath: string, path: string): string {
  return path.length > 0 ? `${rootPath}/${path}` : rootPath;
}

/**
 * Shells out to the real `svn` binary via execFile (argv array, no shell — same rationale as
 * GitCliBrowser). Subversion is centralized: `rootPath` is a repository URL, not a local
 * checkout, so every operation reads directly from the server with no working copy involved.
 * Uses `svn`'s plain-text output throughout (not `--xml`) — the plain formats need no XML
 * parser and, unlike XML, never need entity-escaping/unescaping for message content.
 */
export class SubversionCliBrowser implements ScmBrowser {
  private async resolveRevision(rootPath: string, ref: string): Promise<number> {
    if (ref !== "HEAD") return Number(ref);
    const { stdout } = await execFileAsync("svn", ["info", "--show-item", "revision", `${rootPath}@HEAD`]);
    return Number(stdout.trim());
  }

  async listTree(rootPath: string, ref: string, path: string): Promise<TreeEntry[]> {
    validateRef(ref);
    validateRepositoryPath(path);
    // Unlike `git ls-tree` (which fails on a blob path), `svn list` happily "lists" a file
    // target as its own single entry — so a repository/page.tsx-style "not a tree, try it as a
    // file" fallback would never trigger without this explicit kind check first.
    const { stdout: kind } = await execFileAsync("svn", ["info", "--show-item", "kind", `${target(rootPath, path)}@${ref}`]);
    if (kind.trim() !== "dir") {
      throw new Error(`${path} is not a directory`);
    }
    const { stdout } = await execFileAsync("svn", ["list", `${target(rootPath, path)}@${ref}`]);
    return stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const isDir = line.endsWith("/");
        const name = isDir ? line.slice(0, -1) : line;
        return { name, path: path.length > 0 ? `${path}/${name}` : name, kind: isDir ? "tree" : "blob" } as TreeEntry;
      });
  }

  async readFile(rootPath: string, ref: string, path: string): Promise<string> {
    validateRef(ref);
    validateRepositoryPath(path);
    const { stdout } = await execFileAsync("svn", ["cat", `${target(rootPath, path)}@${ref}`]);
    return stdout;
  }

  async log(rootPath: string, ref: string, limit: number): Promise<Commit[]> {
    validateRef(ref);
    const { stdout } = await execFileAsync("svn", ["log", "-r", `${ref}:1`, `--limit=${limit}`, rootPath]);
    return parseSvnLog(stdout);
  }

  async diff(rootPath: string, ref: string): Promise<string> {
    validateRef(ref);
    const toRev = await this.resolveRevision(rootPath, ref);
    const fromRev = toRev - 1;
    const { stdout } = await execFileAsync("svn", ["diff", "-r", `${fromRev}:${toRev}`, `${rootPath}@${toRev}`]);
    return stdout;
  }

  async blame(rootPath: string, ref: string, path: string): Promise<BlameLine[]> {
    validateRef(ref);
    validateRepositoryPath(path);
    const { stdout } = await execFileAsync("svn", ["blame", `${target(rootPath, path)}@${ref}`]);
    const lines: BlameLine[] = [];
    let lineNumber = 0;
    for (const line of stdout.split("\n")) {
      const match = /^\s*(\d+)\s+(\S+)\s(.*)$/.exec(line);
      if (!match) continue;
      lineNumber++;
      const [, commitHash, author, content] = match;
      lines.push({ lineNumber, commitHash, author, date: NO_DATE, content });
    }
    return lines;
  }
}
