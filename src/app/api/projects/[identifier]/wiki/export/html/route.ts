import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { sortWikiPagesForExport } from "@/domain/wiki/export";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository, DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Mirrors WikiController#export format.html (a single self-contained HTML file: a title index
// followed by every page's content) — see domain/wiki/export.ts for the ordering
// simplification. Wiki content here is plain text with macro placeholders, not
// Textile/Markdown, so pages render inside <pre> rather than through a rich-text renderer —
// there's no such renderer elsewhere in this app to reuse.
export async function GET(_request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "export_wiki_pages", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const wikiPageRepository = new DrizzleWikiPageRepository();
  const wikiContentRepository = new DrizzleWikiContentRepository();
  const pages = sortWikiPagesForExport(await wikiPageRepository.listForProject(project.id));
  const contents = await Promise.all(pages.map((page) => wikiContentRepository.findCurrent(page.id)));

  const toc = pages.map((page) => `<li><a href="#${escapeHtml(page.title)}">${escapeHtml(page.title)}</a></li>`).join("\n");
  const body = pages
    .map((page, index) => {
      const content = contents[index];
      return [
        "<hr/>",
        `<h2 id="${escapeHtml(page.title)}">${escapeHtml(page.title)}</h2>`,
        `<pre>${escapeHtml(content?.text ?? "")}</pre>`,
      ].join("\n");
    })
    .join("\n");

  const html = [
    "<!DOCTYPE html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8"/>',
    `<title>${escapeHtml(project.name)}</title>`,
    "</head>",
    "<body>",
    `<strong>${escapeHtml(project.name)}</strong>`,
    `<ul>${toc}</ul>`,
    body,
    "</body>",
    "</html>",
  ].join("\n");

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${identifier}-wiki.html"`,
      "Cache-Control": "private, no-store",
    },
  });
}
