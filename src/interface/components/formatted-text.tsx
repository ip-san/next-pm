import { renderFormattedText } from "@/domain/formatting/markdown";

/**
 * A text field rendered as CommonMark (Redmine's text_formatting). The HTML comes from renderFormattedText, which
 * escapes raw HTML and blanks unsafe link schemes, so it's safe to inject here.
 */
export function FormattedText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div
      className={`text-sm [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_code]:bg-gray-100 [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold ${className}`}
      dangerouslySetInnerHTML={{ __html: renderFormattedText(text) }}
    />
  );
}
