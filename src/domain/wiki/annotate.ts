import { diffLines } from "./diff";

export interface AnnotatedLine {
  text: string;
  /** The version that introduced this exact line. */
  version: number;
  /** Author of that version. */
  authorId: string;
}

interface AnnotatableVersion {
  version: number;
  authorId: string;
  text: string;
}

/**
 * Line-by-line blame for a wiki page, mirroring Redmine's WikiAnnotate: every line of the
 * target version is attributed to the version that introduced it.
 *
 * Redmine walks the history backwards from the target, filling in attributions until no line
 * is left unattributed. This walks forwards instead — starting from the oldest version and
 * carrying each surviving line's attribution through the diff to the next one — which reaches
 * the same answer with the line-based `diffLines` already used by the diff view, and needs no
 * position bookkeeping.
 *
 * `versions` must be ordered oldest-first and end at the version being annotated.
 */
export function annotateWikiContent(versions: readonly AnnotatableVersion[]): AnnotatedLine[] {
  const [first, ...rest] = versions;
  if (!first) {
    return [];
  }

  let annotated: AnnotatedLine[] = splitLines(first.text).map((text) => ({
    text,
    version: first.version,
    authorId: first.authorId,
  }));
  let previousText = first.text;

  for (const current of rest) {
    const next: AnnotatedLine[] = [];
    let carried = 0;
    for (const line of diffLines(previousText, current.text)) {
      if (line.kind === "same") {
        next.push(annotated[carried]);
        carried++;
      } else if (line.kind === "remove") {
        carried++;
      } else {
        next.push({ text: line.text, version: current.version, authorId: current.authorId });
      }
    }
    annotated = next;
    previousText = current.text;
  }

  return annotated;
}

/** Matches diffLines' own splitting, so an empty text annotates to no lines rather than one. */
function splitLines(text: string): string[] {
  return text.length > 0 ? text.split("\n") : [];
}
