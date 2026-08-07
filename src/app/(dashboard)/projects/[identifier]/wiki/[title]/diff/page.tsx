import { notFound, redirect } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { diffLines } from "@/domain/wiki/diff";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import {
  DrizzleWikiContentRepository,
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

const LINE_STYLE: Record<string, string> = {
  add: "bg-green-100 text-green-900",
  remove: "bg-red-100 text-red-900",
  same: "",
};

export default async function WikiDiffPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string; title: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { identifier, title: rawTitle } = await params;
  const { from, to } = await searchParams;
  const title = decodeURIComponent(rawTitle);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const fromVersion = Number(from);
  const toVersion = Number(to);
  if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion)) {
    notFound();
  }

  const resolved = await resolveWikiPage(
    { wikiPageRepository: new DrizzleWikiPageRepository(), wikiRedirectRepository: new DrizzleWikiRedirectRepository() },
    project.id,
    title,
  );
  if (!resolved) {
    notFound();
  }
  if (resolved.redirected) {
    redirect(`/projects/${identifier}/wiki/${encodeURIComponent(resolved.page.title)}/diff?from=${from}&to=${to}`);
  }
  const wikiPage = resolved.page;

  const wikiContentRepository = new DrizzleWikiContentRepository();
  const [fromContent, toContent] = await Promise.all([
    wikiContentRepository.findVersion(wikiPage.id, fromVersion),
    wikiContentRepository.findVersion(wikiPage.id, toVersion),
  ]);
  if (!fromContent || !toContent) {
    notFound();
  }

  const lines = diffLines(fromContent.text, toContent.text);

  return (
    <main className="p-8 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">
        {title} — v{fromVersion} → v{toVersion}
      </h1>
      <pre className="text-sm font-mono border rounded p-3 overflow-x-auto">
        {lines.map((line, index) => (
          <div key={index} className={LINE_STYLE[line.kind]}>
            {line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  "}
            {line.text}
          </div>
        ))}
      </pre>
    </main>
  );
}
