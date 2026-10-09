import { micromark } from "micromark";

/**
 * Renders a text field (an issue description or note, a news item, wiki text, a message) as CommonMark HTML, the
 * default Redmine's text_formatting setting uses (common_mark).
 *
 * The safety comes from the renderer, not from a sanitizer pass, and the tests pin it:
 * - raw HTML is escaped, never emitted, so `<script>` and `<img onerror>` show as text;
 * - a link or image address is kept only when its scheme is on micromark's allowlist (http, https, irc, ircs,
 *   mailto, xmpp) or it is relative; `javascript:`, `data:`, `vbscript:` and entity-encoded forms of them render
 *   with an empty address.
 */
export function renderFormattedText(source: string): string {
  return micromark(source);
}
