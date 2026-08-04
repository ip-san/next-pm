import JSZip from "jszip";
import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { archivedWikiPageFilename, sortWikiPagesForExport } from "@/domain/wiki/export";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository, DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

// Mirrors WikiController#export format.zip / #wiki_pages_to_zip — one .txt file per page,
// content only. Redmine's zip export does not bundle attachments despite eager-loading them for
// the html/pdf views, so this doesn't either — that's parity, not a scope cut. See
// domain/wiki/export.ts for filename sanitization/sorting (shared with the html/pdf exports).
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

  const zip = new JSZip();
  const usedFilenames = new Set<string>();
  pages.forEach((page, index) => {
    const content = contents[index];
    const filename = archivedWikiPageFilename(page.title, usedFilenames);
    zip.file(filename, content?.text ?? "", content ? { date: content.createdAt } : {});
  });
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${identifier}-wiki.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
