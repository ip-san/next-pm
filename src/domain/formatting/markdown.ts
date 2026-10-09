import { micromark } from "micromark";
import { linkIssueReferences, type IssueLink } from "./issue-references";
import { linkRevisionReferences, linkWikiReferences, type LinkTarget } from "./repository-references";

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
 * `links` turns `#N`, `[[Page]]` and `r<id>` references into links; the caller decides which targets the viewer may
 * link (see interface/http). A reference without a link stays as written.
 */
export interface FormattedTextLinks {
  issues?: ReadonlyMap<number, IssueLink>;
  wikiPages?: ReadonlyMap<string, LinkTarget>;
  revisions?: ReadonlyMap<string, LinkTarget>;
}

export function renderFormattedText(source: string, links: FormattedTextLinks = {}): string {
  let text = source;
  if (links.issues) text = linkIssueReferences(text, links.issues);
  if (links.wikiPages) text = linkWikiReferences(text, links.wikiPages);
  if (links.revisions) text = linkRevisionReferences(text, links.revisions);
  return micromark(text);
}
