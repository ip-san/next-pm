const BLOCK_END_RE = /<\/(p|div|tr|li|h[1-6]|blockquote|pre|table|ul|ol)\s*>/gi;
const LINE_BREAK_RE = /<br\s*\/?>/gi;
const DROPPED_ELEMENT_RE = /<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAG_RE = /<[^>]*>/g;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const codePoint = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(codePoint) && codePoint > 0 ? String.fromCodePoint(codePoint) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Stands in for Redmine's `MailHandler.html_body_to_text`, which delegates to the configured
 * wiki formatter's HTML parser. next-pm has no HTML-to-markup parser, and the result is only
 * ever used as the plain text of an issue description or a note, so this keeps block structure
 * (one blank line per closed block, `<br>` as a newline) and throws the markup away.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(DROPPED_ELEMENT_RE, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(LINE_BREAK_RE, "\n")
    .replace(BLOCK_END_RE, "\n\n");

  return decodeEntities(withBreaks.replace(TAG_RE, ""))
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
