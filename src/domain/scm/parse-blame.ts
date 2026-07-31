import type { BlameLine } from "./entity";

const HEADER_LINE = /^([0-9a-f]{40}) \d+ (\d+)/;

/**
 * Parses `git blame --line-porcelain` output. Unlike plain `--porcelain`, `--line-porcelain`
 * repeats every metadata field (author, author-time, ...) for every source line rather than
 * only on the first line of a commit group, so each line's record can be read independently
 * without carrying state across commit boundaries.
 */
export function parseBlamePorcelain(output: string): BlameLine[] {
  const lines: BlameLine[] = [];
  let commitHash = "";
  let finalLineNumber = 0;
  let author = "";
  let authorTime: number | null = null;

  for (const line of output.split("\n")) {
    const header = HEADER_LINE.exec(line);
    if (header) {
      commitHash = header[1];
      finalLineNumber = Number(header[2]);
      continue;
    }
    if (line.startsWith("author ")) {
      author = line.slice("author ".length);
      continue;
    }
    if (line.startsWith("author-time ")) {
      authorTime = Number(line.slice("author-time ".length));
      continue;
    }
    if (line.startsWith("\t")) {
      lines.push({
        lineNumber: finalLineNumber,
        commitHash,
        author,
        date: authorTime !== null ? new Date(authorTime * 1000).toISOString().slice(0, 10) : "",
        content: line.slice(1),
      });
    }
  }
  return lines;
}
