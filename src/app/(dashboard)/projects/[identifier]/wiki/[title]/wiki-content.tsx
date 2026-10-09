import type { TextProject } from "@/interface/http/project-text-links";
import { FormattedText } from "@/interface/components/formatted-text";
import Link from "next/link";
import type { WikiBlock } from "@/domain/wiki/macro-blocks";

/**
 * Renders the blocks parsed by domain/wiki/macro-blocks.ts. Every value here goes through JSX
 * as a child or attribute, so page content is never interpolated into markup — the reason the
 * macro pass returns data rather than an HTML string.
 */
export async function WikiContent({ blocks, identifier, project }: { blocks: WikiBlock[]; identifier: string; project: TextProject }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "text":
            return (
              <p key={index} className="whitespace-pre-wrap">
                {block.text}
              </p>
            );

          case "collapse":
            // <details> gives Redmine's show/hide toggle without any client JavaScript.
            return (
              <details key={index} className="border rounded px-3 py-2">
                <summary className="cursor-pointer select-none">{block.showLabel}</summary>
                <FormattedText project={project} text={block.body} className="pt-2" />
              </details>
            );

          case "thumbnail":
            return (
              <a key={index} href={`/api/attachments/${block.attachmentId}`} title={block.title} className="self-start">
                {/* The attachment route streams the original file; there is no thumbnailing
                    endpoint here, so the browser scales it to Redmine's requested size. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/attachments/${block.attachmentId}`} alt={block.filename} width={block.size} />
              </a>
            );

          case "issue":
            return block.href ? (
              <p key={index}>
                <Link href={block.href} className="underline">
                  {block.label}
                </Link>
              </p>
            ) : (
              <p key={index}>{block.label}</p>
            );

          case "macroList":
            return (
              <dl key={index} className="border rounded px-3 py-2 flex flex-col gap-2">
                {block.macros.map((macro) => (
                  <div key={macro.name}>
                    <dt className="font-mono font-medium">{macro.name}</dt>
                    <dd className="whitespace-pre-wrap text-gray-600 text-xs">{macro.description}</dd>
                  </div>
                ))}
              </dl>
            );

          case "recentPages":
            return block.pages.length === 0 ? (
              <p key={index} className="text-gray-500 text-xs">
                最近更新されたページはありません。
              </p>
            ) : (
              <ul key={index} className="flex flex-col gap-1 pl-4 list-disc">
                {block.pages.map((page) => (
                  <li key={page.title}>
                    <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(page.title)}`} className="underline">
                      {page.title}
                    </Link>
                    {block.withTime ? (
                      <span className="text-gray-500 text-xs"> ({page.updatedAt.toISOString().slice(0, 16).replace("T", " ")})</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            );

          case "error":
            return (
              <p key={index} className="text-red-600 text-xs">
                {block.message}
              </p>
            );
        }
      })}
    </div>
  );
}
