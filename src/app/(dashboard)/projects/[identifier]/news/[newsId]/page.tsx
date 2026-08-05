import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleNewsCommentRepository, DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { DeleteNewsButton } from "./delete-news-button";
import { NewsCommentForm } from "./news-comment-form";
import { NewsWatchToggleForm } from "./news-watch-toggle-form";

export const dynamic = "force-dynamic";

export default async function NewsDetailPage({ params }: { params: Promise<{ identifier: string; newsId: string }> }) {
  const { identifier, newsId } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_news", project: projectContext, actor })) {
    notFound();
  }

  const newsRepository = new DrizzleNewsRepository();
  const item = await newsRepository.findById(newsId);
  if (!item || item.projectId !== project.id) {
    notFound();
  }

  const comments = await new DrizzleNewsCommentRepository().listByNews(item.id);
  const canManageNews = can({ permission: "manage_news", project: projectContext, actor });
  const canComment = can({ permission: "comment_news", project: projectContext, actor });
  const isWatching = user ? await new DrizzleWatcherRepository().isWatching("News", item.id, user.id) : false;

  return (
    <main className="p-8 flex flex-col gap-6">
      <article>
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-semibold">{item.title}</h1>
          {user ? <NewsWatchToggleForm newsId={item.id} projectIdentifier={identifier} isWatching={isWatching} /> : null}
        </div>
        <p className="text-xs text-gray-500">{item.createdAt.toISOString()}</p>
        <p className="whitespace-pre-wrap text-sm mt-2">{item.description}</p>
        {canManageNews ? <DeleteNewsButton projectIdentifier={identifier} newsId={item.id} /> : null}
      </article>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">コメント</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {comments.map((comment) => (
            <li key={comment.id} className="border rounded p-2">
              <p className="text-xs text-gray-500">{comment.createdAt.toISOString()}</p>
              <p className="whitespace-pre-wrap">{comment.content}</p>
            </li>
          ))}
        </ul>
        {canComment ? <NewsCommentForm projectIdentifier={identifier} newsId={item.id} /> : null}
      </section>
    </main>
  );
}
