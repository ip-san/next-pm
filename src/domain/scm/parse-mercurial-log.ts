import type { Commit } from "./entity";

/**
 * Parses the output of `hg log --template "{node}\x1f{author|person}\x1f{author|email}\x1f{date|isodatesec}\x1f{desc}\x1e"`
 * — same \x1f (field) / \x1e (record) separator convention GitCliBrowser uses for `git log`, so
 * a commit message containing pipes, newlines, or any other "normal" punctuation can never be
 * mistaken for a field boundary.
 */
export function parseMercurialLog(output: string): Commit[] {
  return output
    .split("\x1e")
    .map((entry) => entry.replace(/^\n/, ""))
    .filter((entry) => entry.trim().length > 0)
    .map((entry) => {
      const [hash, author, authorEmail, date, message] = entry.split("\x1f");
      return { hash, author, authorEmail, date, message: message.trimEnd() };
    });
}
