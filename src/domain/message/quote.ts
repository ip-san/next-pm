/**
 * Port of `Redmine::QuoteReply::Builder#quote_root_message` / `#build_quote`.
 *
 * The header is "<author> wrote:", the body is the quoted text with every line prefixed by
 * "> ", and the whole thing ends with a blank line so the reply starts on a fresh paragraph.
 * Redmine also collapses `<pre>` blocks to "[...]" — next-pm stores plain text and renders no
 * HTML in messages, so there is nothing to collapse.
 */
export function buildQuote(authorName: string, content: string): string {
  const quoted = content.trim().replace(/\r?\n|\r/g, "\n> ");
  return `${authorName} wrote:\n> ${quoted}\n\n`;
}

/** Mirrors MessagesController#quote: "RE: " is added only when it isn't there already. */
export function quotedSubject(subject: string): string {
  return subject.startsWith("RE:") ? subject : `RE: ${subject}`;
}
