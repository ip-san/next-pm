import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BlameLine, Commit, TreeEntry } from "@/domain/scm/entity";
import type { GitBrowser } from "@/domain/scm/git-browser";
import { parseBlamePorcelain } from "@/domain/scm/parse-blame";
import { validateRef, validateRepositoryPath } from "@/domain/scm/validate-path";

const execFileAsync = promisify(execFile);

/**
 * Shells out to the real `git` binary via execFile (argv array, no shell) so no value here is
 * ever interpreted by a shell — the injection surface that matters is git's own argument
 * parsing, which validateRef/validateRepositoryPath guard against (both reject anything
 * starting with `-`, so a ref/path can never be mistaken for a flag). Note that a `--`
 * separator would actually break `git show <treeish>` here: git treats `--` as introducing a
 * pathspec filter, and `HEAD:path` is a single object argument, not a pathspec — adding `--`
 * silently makes it match nothing rather than erroring.
 */
export class GitCliBrowser implements GitBrowser {
  async listTree(rootPath: string, ref: string, path: string): Promise<TreeEntry[]> {
    validateRef(ref);
    validateRepositoryPath(path);
    const treeish = path.length > 0 ? `${ref}:${path}` : ref;
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "ls-tree", treeish]);
    return stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [meta, name] = line.split("\t");
        const kind = meta.split(" ")[1] === "tree" ? "tree" : "blob";
        return { name, path: path.length > 0 ? `${path}/${name}` : name, kind } as TreeEntry;
      });
  }

  async readFile(rootPath: string, ref: string, path: string): Promise<string> {
    validateRef(ref);
    validateRepositoryPath(path);
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "show", `${ref}:${path}`]);
    return stdout;
  }

  async log(rootPath: string, ref: string, limit: number): Promise<Commit[]> {
    validateRef(ref);
    // %B (full raw body: subject + blank line + body), not %s (subject only) — commit-message
    // keyword scanning (domain/scm/keyword-scan.ts) needs the whole message, since "fixes #..."
    // commonly sits in the body rather than the subject line.
    const format = "%H%x1f%an%x1f%ae%x1f%ad%x1f%B%x1e";
    const { stdout } = await execFileAsync("git", [
      "-C",
      rootPath,
      "log",
      `--max-count=${limit}`,
      `--pretty=format:${format}`,
      "--date=iso",
      ref,
    ]);
    return stdout
      .split("\x1e")
      .filter((entry) => entry.trim().length > 0)
      .map((entry) => {
        const [hash, author, authorEmail, date, message] = entry.replace(/^\n/, "").split("\x1f");
        return { hash, author, authorEmail, date, message: message.trimEnd() };
      });
  }

  async diff(rootPath: string, ref: string): Promise<string> {
    validateRef(ref);
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "show", "--no-color", ref]);
    return stdout;
  }

  async blame(rootPath: string, ref: string, path: string): Promise<BlameLine[]> {
    validateRef(ref);
    validateRepositoryPath(path);
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "blame", "--line-porcelain", ref, "--", path]);
    return parseBlamePorcelain(stdout);
  }
}
