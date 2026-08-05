import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { canDeleteMessage, canEditMessage } from "@/domain/message/authorization";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { MessageForm } from "../../message-form";
import { DeleteMessageButton } from "./delete-message-button";
import { EditMessageForm } from "./edit-message-form";
import { MessageWatchToggleForm } from "./message-watch-toggle-form";

export const dynamic = "force-dynamic";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ identifier: string; boardId: string; messageId: string }>;
}) {
  const { identifier, boardId, messageId } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_messages", project: projectContext, actor })) {
    notFound();
  }

  const board = await new DrizzleBoardRepository().findById(boardId);
  if (!board || board.projectId !== project.id) {
    notFound();
  }

  const messageRepository = new DrizzleMessageRepository();
  const topic = await messageRepository.findById(messageId);
  if (!topic || topic.boardId !== board.id || topic.parentId) {
    notFound();
  }

  const replies = await messageRepository.listReplies(topic.id);

  const canPost = can({ permission: "add_messages", project: projectContext, actor });
  const hasEditMessages = can({ permission: "edit_messages", project: projectContext, actor });
  const hasEditOwnMessages = can({ permission: "edit_own_messages", project: projectContext, actor });
  const hasDeleteMessages = can({ permission: "delete_messages", project: projectContext, actor });
  const hasDeleteOwnMessages = can({ permission: "delete_own_messages", project: projectContext, actor });
  const isWatching = user ? await new DrizzleWatcherRepository().isWatching("Message", topic.id, user.id) : false;

  return (
    <main className="p-8 flex flex-col gap-6">
      <article className="border rounded p-3">
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-semibold">{topic.subject}</h1>
          {user ? <MessageWatchToggleForm messageId={topic.id} boardId={board.id} projectIdentifier={identifier} isWatching={isWatching} /> : null}
        </div>
        <p className="text-xs text-gray-500">{topic.createdAt.toISOString()}</p>
        <p className="whitespace-pre-wrap text-sm mt-2">{topic.content}</p>
        <div className="flex gap-3 mt-2">
          {user && canEditMessage(topic, user.id, hasEditMessages, hasEditOwnMessages) ? (
            <EditMessageForm projectIdentifier={identifier} boardId={board.id} messageId={topic.id} subject={topic.subject} content={topic.content} />
          ) : null}
          {user && canDeleteMessage(topic, user.id, hasDeleteMessages, hasDeleteOwnMessages) ? (
            <DeleteMessageButton projectIdentifier={identifier} boardId={board.id} messageId={topic.id} />
          ) : null}
        </div>
      </article>

      <ul className="flex flex-col gap-3">
        {replies.map((reply) => (
          <li key={reply.id} className="border rounded p-3 ml-6">
            <p className="text-xs text-gray-500">{reply.createdAt.toISOString()}</p>
            <p className="whitespace-pre-wrap text-sm mt-1">{reply.content}</p>
            {user && canDeleteMessage(reply, user.id, hasDeleteMessages, hasDeleteOwnMessages) ? (
              <DeleteMessageButton projectIdentifier={identifier} boardId={board.id} messageId={reply.id} />
            ) : null}
          </li>
        ))}
      </ul>

      {!topic.locked && canPost ? (
        <section className="border-t pt-4">
          <MessageForm projectIdentifier={identifier} boardId={board.id} parentId={topic.id} topicSubject={topic.subject} />
        </section>
      ) : null}
    </main>
  );
}
