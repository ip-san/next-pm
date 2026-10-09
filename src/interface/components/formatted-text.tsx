import { renderFormattedText } from "@/domain/formatting/markdown";
import { issueReferenceNumbers, type IssueLink } from "@/domain/formatting/issue-references";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveIssueLinks } from "@/interface/http/issue-links";

/**
 * A text field rendered as CommonMark (Redmine's text_formatting), with `#N` issue references linked for the
 * viewer. The HTML comes from renderFormattedText, which escapes raw HTML and blanks unsafe link schemes, so it's
 * safe to inject here. A server component: it reads the viewer's session.
 */
export async function FormattedText({ text, className = "" }: { text: string; className?: string }) {
  const numbers = issueReferenceNumbers(text);
  const links: Map<number, IssueLink> = numbers.length > 0 ? await resolveIssueLinks(await currentUserFromCookies(), numbers) : new Map();
  return (
    <div
      className={`text-sm [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_code]:bg-gray-100 [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold ${className}`}
      dangerouslySetInnerHTML={{ __html: renderFormattedText(text, links) }}
    />
  );
}
