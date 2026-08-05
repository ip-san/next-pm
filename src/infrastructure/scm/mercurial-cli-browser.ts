import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildTreeEntries } from "@/domain/scm/build-tree-entries";
import type { BlameLine, Commit, TreeEntry } from "@/domain/scm/entity";
import { parseMercurialAnnotate } from "@/domain/scm/parse-mercurial-annotate";
import { parseMercurialLog } from "@/domain/scm/parse-mercurial-log";
import type { ScmBrowser } from "@/domain/scm/scm-browser";
import { validateRef, validateRepositoryPath } from "@/domain/scm/validate-path";

const execFileAsync = promisify(execFile);

const LOG_TEMPLATE = "{node}\\x1f{author|person}\\x1f{author|email}\\x1f{date|isodatesec}\\x1f{desc}\\x1e";
const ANNOTATE_TEMPLATE = "{lines % '{lineno}\\x1f{node}\\x1f{author|person}\\x1f{date|isodatesec}\\x1f{line}\\x1e'}";

/** Mercurial has no "HEAD" — the equivalent is the special "tip" revision/branch-head alias. */
function resolveRef(ref: string): string {
  return ref === "HEAD" ? "tip" : ref;
}

/**
 * Shells out to the real `hg` binary via execFile (argv array, no shell — same rationale as
 * GitCliBrowser). `rootPath` is a local repository directory, same as git.
 */
export class MercurialCliBrowser implements ScmBrowser {
  async listTree(rootPath: string, ref: string, path: string): Promise<TreeEntry[]> {
    validateRef(ref);
    validateRepositoryPath(path);
    // No native "list this directory" command — see build-tree-entries.ts.
    const { stdout } = await execFileAsync("hg", ["--cwd", rootPath, "files", "-r", resolveRef(ref)]);
    const filePaths = stdout.split("\n").filter((line) => line.length > 0);
    // `path` naming an actual file (not a directory) is otherwise indistinguishable from a
    // directory with no visible entries — throw so the caller's "not a tree, try it as a file"
    // fallback (mirrors git ls-tree failing on a blob path) kicks in instead of silently
    // rendering an empty directory.
    if (path.length > 0 && filePaths.includes(path)) {
      throw new Error(`${path} is a file, not a directory`);
    }
    return buildTreeEntries(filePaths, path);
  }

  async readFile(rootPath: string, ref: string, path: string): Promise<string> {
    validateRef(ref);
    validateRepositoryPath(path);
    const { stdout } = await execFileAsync("hg", ["--cwd", rootPath, "cat", "-r", resolveRef(ref), path]);
    return stdout;
  }

  async log(rootPath: string, ref: string, limit: number): Promise<Commit[]> {
    validateRef(ref);
    const { stdout } = await execFileAsync("hg", [
      "--cwd",
      rootPath,
      "log",
      "-r",
      `reverse(:${resolveRef(ref)})`,
      `--limit=${limit}`,
      "--template",
      LOG_TEMPLATE,
    ]);
    return parseMercurialLog(stdout);
  }

  async diff(rootPath: string, ref: string): Promise<string> {
    validateRef(ref);
    const { stdout } = await execFileAsync("hg", ["--cwd", rootPath, "diff", "-c", resolveRef(ref)]);
    return stdout;
  }

  async blame(rootPath: string, ref: string, path: string): Promise<BlameLine[]> {
    validateRef(ref);
    validateRepositoryPath(path);
    const { stdout } = await execFileAsync("hg", ["--cwd", rootPath, "annotate", "-r", resolveRef(ref), "--template", ANNOTATE_TEMPLATE, path]);
    return parseMercurialAnnotate(stdout);
  }
}
