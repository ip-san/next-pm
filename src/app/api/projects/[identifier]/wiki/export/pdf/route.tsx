import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { sortWikiPagesForExport } from "@/domain/wiki/export";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository, DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { WikiExportPdfDocument } from "./wiki-export-pdf-document";

export const dynamic = "force-dynamic";

// Mirrors WikiController#export format.pdf. Same content/ordering as the html export
// (domain/wiki/export.ts) — the two must never drift on which pages or which version of
// each page's content they include.
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

  const buffer = await renderToBuffer(
    <WikiExportPdfDocument
      projectName={project.name}
      pages={pages.map((page, index) => ({ title: page.title, text: contents[index]?.text ?? "" }))}
    />,
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${identifier}-wiki.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
