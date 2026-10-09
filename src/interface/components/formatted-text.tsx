import { renderFormattedText } from "@/domain/formatting/markdown";
import { issueReferenceNumbers } from "@/domain/formatting/issue-references";
import { revisionReferenceIds, wikiReferenceTitles } from "@/domain/formatting/repository-references";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveIssueLinks } from "@/interface/http/issue-links";
import { resolveRevisionLinks, resolveWikiLinks, type TextProject } from "@/interface/http/project-text-links";

/**
 * A text field rendered as CommonMark (Redmine's text_formatting), with the references in it linked for the viewer:
 * `#N` issues anywhere, `[[Page]]` wiki pages and `r<id>` revisions of the text's project. Every link is judged for
 * this viewer, and a reference that doesn't resolve stays as written. The HTML comes from renderFormattedText, which
 * escapes raw HTML and blanks unsafe link schemes, so it's safe to inject here. A server component.
 */
export async function FormattedText({ text, project, className = "" }: { text: string; project: TextProject; className?: string }) {
  const issueNumbers = issueReferenceNumbers(text);
  const wikiTitles = wikiReferenceTitles(text);
  const revisionIds = revisionReferenceIds(text);
  const user = issueNumbers.length + wikiTitles.length + revisionIds.length > 0 ? await currentUserFromCookies() : null;
  const [issues, wikiPages, revisions] = await Promise.all([
    issueNumbers.length > 0 ? resolveIssueLinks(user, issueNumbers) : new Map(),
    wikiTitles.length > 0 ? resolveWikiLinks(user, project, wikiTitles) : new Map(),
    revisionIds.length > 0 ? resolveRevisionLinks(user, project, revisionIds) : new Map(),
  ]);
  return (
    <div
      className={`text-sm [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_code]:bg-gray-100 [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold ${className}`}
      dangerouslySetInnerHTML={{ __html: renderFormattedText(text, { issues, wikiPages, revisions }) }}
    />
  );
}
