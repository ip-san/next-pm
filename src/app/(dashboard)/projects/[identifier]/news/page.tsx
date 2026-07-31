import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { NewsCreateForm } from "./news-create-form";

export const dynamic = "force-dynamic";

export default async function NewsListPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_news", project: toAuthorizationProject(project), actor })) {
    notFound();
  }
  const canManageNews = can({ permission: "manage_news", project: toAuthorizationProject(project), actor });

  const items = await new DrizzleNewsRepository().listByProject(project.id);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">ニュース</h1>
      <ul className="flex flex-col gap-3 text-sm">
        {items.map((item) => (
          <li key={item.id} className="border rounded p-3">
            <Link href={`/projects/${identifier}/news/${item.id}`} className="font-medium underline">
              {item.title}
            </Link>
            <p className="text-gray-500 text-xs">{item.createdAt.toISOString()}</p>
            <p className="text-gray-600">{item.summary}</p>
          </li>
        ))}
      </ul>
      {canManageNews ? <NewsCreateForm projectIdentifier={identifier} /> : null}
    </main>
  );
}
