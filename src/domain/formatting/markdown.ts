import { micromark } from "micromark";
import { linkIssueReferences, type IssueLink } from "./issue-references";

/**
 * Renders a text field (an issue description or note, a news item, wiki text, a message) as CommonMark HTML, the
 * default Redmine's text_formatting setting uses (common_mark).
 *
 * The safety comes from the renderer, not from a sanitizer pass, and the tests pin it:
 * - raw HTML is escaped, never emitted, so `<script>` and `<img onerror>` show as text;
 * - a link or image address is kept only when its scheme is on micromark's allowlist (http, https, irc, ircs,
 *   mailto, xmpp) or it is relative; `javascript:`, `data:`, `vbscript:` and entity-encoded forms of them render
 *   with an empty address.
 *
 * `links` turns `#N` references into links; the caller decides which issues the viewer may link (see
 * resolveIssueLinks). A number without a link stays as text.
 */
export function renderFormattedText(source: string, links: ReadonlyMap<number, IssueLink> = new Map()): string {
  return micromark(linkIssueReferences(source, links));
}
