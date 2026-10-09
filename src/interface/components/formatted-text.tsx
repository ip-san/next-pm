import { cache } from "react";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { formattedTextHtml } from "@/interface/http/formatted-text-html";
import type { TextProject } from "@/interface/http/project-text-links";

/** Read once per request: a page with many texts reads the session once, not once per text. */
const currentViewer = cache(() => currentUserFromCookies());

/**
 * A text field rendered as CommonMark (Redmine's text_formatting), with the references in it linked for the viewer.
 * The HTML comes from formattedTextHtml, which escapes raw HTML and blanks unsafe link schemes, so it's safe to inject
 * here. A server component.
 */
export async function FormattedText({ text, project, className = "" }: { text: string; project: TextProject; className?: string }) {
  const user = await currentViewer();
  const html = await formattedTextHtml(user, project, text);
  return (
    <div
      className={`text-sm [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_code]:bg-gray-100 [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
