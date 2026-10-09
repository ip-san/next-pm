/**
 * Redmine's sanitize_anchor_name: keeps letters, marks, digits, underscores, dashes and spaces, then turns each run of
 * spaces (with any dashes after it) into one dash. Headings get their ids this way, and `[[Page#Section]]` links
 * point at them.
 */
export function anchorName(text: string): string {
  return text.replace(/[^\s\-\p{L}\p{M}\p{N}\p{Pc}]/gu, "").replace(/\s+(-+\s*)?/g, "-");
}

/** Hands out anchors for the headings of one text, numbering repeats `-2`, `-3`, … as Redmine's parse_headings does. */
export function anchorCounter(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const anchor = anchorName(text.trim());
    const count = (seen.get(anchor) ?? 0) + 1;
    seen.set(anchor, count);
    return count > 1 ? `${anchor}-${count}` : anchor;
  };
}
