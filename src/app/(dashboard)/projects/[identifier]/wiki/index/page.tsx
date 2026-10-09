import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { buildWikiPageTree, type WikiPageTreeNode } from "@/domain/wiki/hierarchy";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

interface IndexPage {
  id: string;
  parentId: string | null;
  title: string;
}

function PageTree({ nodes, identifier }: { nodes: WikiPageTreeNode<IndexPage>[]; identifier: string }) {
  return (
    <ul className="flex flex-col gap-1 pl-4 list-disc">
      {nodes.map((node) => (
        <li key={node.page.id}>
          <Link href={`/projects/${identifier}/wiki/${encodeURIComponent(node.page.title)}`} className="underline">
            {node.page.title}
          </Link>
          {node.children.length > 0 ? <PageTree nodes={node.children} identifier={identifier} /> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Mirrors WikiController#index: every page of the wiki, nested by parent. A page literally
 * titled "index" is unreachable at this URL because Next.js resolves the static segment
 * first — the same collision Redmine avoids by routing `wiki/index` ahead of `wiki/:id`.
 */
export default async function WikiIndexListPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const pages = await new DrizzleWikiPageRepository().listForProject(project.id);

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "wiki.indexTitle"), { project: project.name })}</h1>
        <Link href={`/projects/${identifier}/wiki/date_index`} className="text-sm underline">
          {translate(locale, "wiki.byDate")}
        </Link>
      </div>
      {pages.length === 0 ? (
        <p className="text-sm text-gray-500">{translate(locale, "wiki.noPages")}</p>
      ) : (
        <div className="text-sm">
          <PageTree nodes={buildWikiPageTree(pages)} identifier={identifier} />
        </div>
      )}
    </main>
  );
}
