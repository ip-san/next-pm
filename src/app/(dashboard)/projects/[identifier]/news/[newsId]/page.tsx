import { FormattedText } from "@/interface/components/formatted-text";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleNewsCommentRepository, DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { AttachmentList } from "../../../attachment-list";
import { DeleteNewsButton } from "./delete-news-button";
import { NewsCommentForm } from "./news-comment-form";
import {
  DeleteNewsAttachmentButton,
  DeleteNewsCommentButton,
  NewsAttachmentUploadForm,
  NewsEditForm,
} from "./news-manage-forms";
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

  const [comments, attachments] = await Promise.all([
    new DrizzleNewsCommentRepository().listByNews(item.id),
    new DrizzleAttachmentRepository().listByContainer("News", item.id),
  ]);
  // manage_news is the single gate Redmine uses for editing, deleting, attachments and
  // comment removal (preparation.rb maps comments#destroy under it too).
  const canManageNews = can({ permission: "manage_news", project: projectContext, actor });
  const canComment = can({ permission: "comment_news", project: projectContext, actor });
  const isWatching = user ? await new DrizzleWatcherRepository().isWatching("News", item.id, user.id) : false;

  const authors = await new DrizzleUserRepository().findByIds([...new Set([item.authorId, ...comments.map((c) => c.authorId)])]);
  const authorLabelById = new Map(authors.map((u) => [u.id, `${u.lastname} ${u.firstname}`]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <article>
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-semibold">{item.title}</h1>
          {user ? <NewsWatchToggleForm newsId={item.id} projectIdentifier={identifier} isWatching={isWatching} /> : null}
        </div>
        <p className="text-xs text-gray-500">
          {authorLabelById.get(item.authorId) ?? ""} · {item.createdAt.toISOString()}
        </p>
        {item.summary ? <p className="text-sm text-gray-600 mt-1">{item.summary}</p> : null}
        <FormattedText project={project} text={item.description} className="mt-2" />
        {canManageNews ? (
          <div className="flex gap-3 mt-2 items-start">
            <NewsEditForm
              projectIdentifier={identifier}
              newsId={item.id}
              title={item.title}
              summary={item.summary}
              description={item.description}
            />
            <DeleteNewsButton projectIdentifier={identifier} newsId={item.id} />
          </div>
        ) : null}
      </article>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">添付ファイル</h2>
        <AttachmentList
          attachments={attachments}
          renderAction={
            canManageNews
              ? (attachment) => <DeleteNewsAttachmentButton projectIdentifier={identifier} newsId={item.id} attachmentId={attachment.id} />
              : undefined
          }
        />
        {canManageNews ? <NewsAttachmentUploadForm projectIdentifier={identifier} newsId={item.id} /> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">コメント</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {comments.map((comment) => (
            <li key={comment.id} className="border rounded p-2">
              <p className="text-xs text-gray-500">
                {authorLabelById.get(comment.authorId) ?? ""} · {comment.createdAt.toISOString()}
              </p>
              <FormattedText project={project} text={comment.content} />
              {canManageNews ? (
                <DeleteNewsCommentButton projectIdentifier={identifier} newsId={item.id} commentId={comment.id} />
              ) : null}
            </li>
          ))}
        </ul>
        {canComment ? <NewsCommentForm projectIdentifier={identifier} newsId={item.id} /> : null}
      </section>
    </main>
  );
}
