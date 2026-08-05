import type { BlameLine } from "./entity";

/**
 * Parses the output of
 * `hg annotate -r <rev> --template "{lines % '{lineno}\x1f{node}\x1f{author|person}\x1f{date|isodatesec}\x1f{line}\x1e'}"`.
 * `{line}` includes the source line's own trailing newline (hg doesn't strip it), so each
 * record is really `...\x1f<content>\n\x1e` — the trailing `\n` is stripped from `content` here
 * rather than baked into the template, since a template-level trim would also eat a
 * genuinely-blank final line.
 */
export function parseMercurialAnnotate(output: string): BlameLine[] {
  return output
    .split("\x1e")
    .filter((record) => record.length > 0)
    .map((record) => {
      const [lineNumber, commitHash, author, date, content] = record.split("\x1f");
      return {
        lineNumber: Number(lineNumber),
        commitHash,
        author,
        date,
        content: content.endsWith("\n") ? content.slice(0, -1) : content,
      };
    });
}
