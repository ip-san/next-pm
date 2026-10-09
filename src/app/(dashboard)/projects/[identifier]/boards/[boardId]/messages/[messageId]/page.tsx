import { FormattedText } from "@/interface/components/formatted-text";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import { canDeleteMessage, canEditMessage } from "@/domain/message/authorization";
import type { Message } from "@/domain/message/entity";
import { buildQuote, quotedSubject } from "@/domain/message/quote";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { AttachmentList } from "../../../../../attachment-list";
import { MessageForm } from "../../message-form";
import { DeleteMessageButton } from "./delete-message-button";
import { EditMessageForm } from "./edit-message-form";
import { DeleteMessageAttachmentButton, MessageAttachmentUploadForm } from "./message-attachment-forms";
import { MessageWatcherManager } from "./message-watcher-manager";
import { MessageWatchToggleForm } from "./message-watch-toggle-form";

export const dynamic = "force-dynamic";

export default async function MessageThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string; boardId: string; messageId: string }>;
  searchParams: Promise<{ quote?: string }>;
}) {
  const { identifier, boardId, messageId } = await params;
  const { quote: quotedMessageId } = await searchParams;

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

  const boardRepository = new DrizzleBoardRepository();
  const board = await boardRepository.findById(boardId);
  if (!board || board.projectId !== project.id) {
    notFound();
  }

  const messageRepository = new DrizzleMessageRepository();
  const topic = await messageRepository.findById(messageId);
  if (!topic || topic.boardId !== board.id || topic.parentId) {
    notFound();
  }

  const replies = await messageRepository.listReplies(topic.id);
  const thread = [topic, ...replies];

  const canPost = can({ permission: "add_messages", project: projectContext, actor });
  const hasEditMessages = can({ permission: "edit_messages", project: projectContext, actor });
  const hasEditOwnMessages = can({ permission: "edit_own_messages", project: projectContext, actor });
  const hasDeleteMessages = can({ permission: "delete_messages", project: projectContext, actor });
  const hasDeleteOwnMessages = can({ permission: "delete_own_messages", project: projectContext, actor });
  const canAddWatchers = can({ permission: "add_message_watchers", project: projectContext, actor });
  const canRemoveWatchers = can({ permission: "delete_message_watchers", project: projectContext, actor });
  const canViewWatchers = can({ permission: "view_message_watchers", project: projectContext, actor });

  const watcherRepository = new DrizzleWatcherRepository();
  const attachmentRepository = new DrizzleAttachmentRepository();
  const [watcherUserIds, members, attachments, projectBoards] = await Promise.all([
    watcherRepository.listWatcherUserIds("Message", topic.id),
    new DrizzleMemberRepository().listByProject(project.id),
    attachmentRepository.listByContainers("Message", thread.map((message) => message.id)),
    boardRepository.listByProject(project.id),
  ]);
  const isWatching = user ? watcherUserIds.includes(user.id) : false;

  const projectMemberUserIds = memberUserIds(members);
  const authorIds = thread.map((message) => message.authorId);
  const relevantUsers = await new DrizzleUserRepository().findByIds([
    ...new Set([...watcherUserIds, ...projectMemberUserIds, ...authorIds]),
  ]);
  const userLabelById = new Map(relevantUsers.map((u) => [u.id, `${u.lastname} ${u.firstname}`]));
  const watcherList = watcherUserIds.map((id) => ({ id, label: userLabelById.get(id) ?? id }));
  const watcherCandidates = projectMemberUserIds
    .filter((userId) => !watcherUserIds.includes(userId))
    .map((id) => ({ id, label: userLabelById.get(id) ?? id }));

  const attachmentsOf = (message: Message) => attachments.filter((attachment) => attachment.containerId === message.id);

  // MessagesController#quote prefills the reply form with the quoted body and an "RE: " subject.
  const quoted = quotedMessageId ? thread.find((message) => message.id === quotedMessageId) : undefined;
  const replySubject = quotedSubject(topic.subject);
  const replyBody = quoted ? buildQuote(userLabelById.get(quoted.authorId) ?? "", quoted.content) : undefined;

  const messageActions = (message: Message) => (
      <div className="flex gap-3 mt-2 items-start">
        {canPost && !topic.locked ? (
          <Link href={`?quote=${message.id}#reply`} className="text-xs underline">
            引用
          </Link>
        ) : null}
        {user && canEditMessage(message, user.id, hasEditMessages, hasEditOwnMessages) ? (
          <EditMessageForm
            projectIdentifier={identifier}
            boardId={board.id}
            messageId={message.id}
            subject={message.subject}
            content={message.content}
            isTopic={message.parentId === null}
            locked={message.locked}
            sticky={message.sticky}
            canEditAllMessages={hasEditMessages}
            moveTargets={projectBoards.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
          />
        ) : null}
        {user && canDeleteMessage(message, user.id, hasDeleteMessages, hasDeleteOwnMessages) ? (
          <DeleteMessageButton projectIdentifier={identifier} boardId={board.id} messageId={message.id} />
        ) : null}
      </div>
  );

  const messageAttachments = (message: Message) => {
    const own = attachmentsOf(message);
    const editable = user ? canEditMessage(message, user.id, hasEditMessages, hasEditOwnMessages) : false;
    if (own.length === 0 && !editable) {
      return null;
    }
    return (
      <section className="flex flex-col gap-2 mt-2">
        <AttachmentList
          attachments={own}
          emptyLabel=""
          renderAction={
            hasEditMessages
              ? (attachment) => (
                  <DeleteMessageAttachmentButton projectIdentifier={identifier} boardId={board.id} attachmentId={attachment.id} />
                )
              : undefined
          }
        />
        {editable ? <MessageAttachmentUploadForm projectIdentifier={identifier} boardId={board.id} messageId={message.id} /> : null}
      </section>
    );
  };

  return (
    <main className="p-8 flex flex-col gap-6">
      <article className="border rounded p-3">
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-semibold">
            {topic.sticky ? "📌 " : ""}
            {topic.subject}
            {topic.locked ? <span className="text-xs text-gray-500 ml-2">(ロック中)</span> : null}
          </h1>
          {user ? <MessageWatchToggleForm messageId={topic.id} boardId={board.id} projectIdentifier={identifier} isWatching={isWatching} /> : null}
        </div>
        <p className="text-xs text-gray-500">
          {userLabelById.get(topic.authorId) ?? ""} · {topic.createdAt.toISOString()}
        </p>
        <FormattedText project={project} text={topic.content} className="mt-2" />
        {messageAttachments(topic)}
        {messageActions(topic)}
      </article>

      {canAddWatchers || (watcherList.length > 0 && canViewWatchers) ? (
        <MessageWatcherManager
          messageId={topic.id}
          boardId={board.id}
          projectIdentifier={identifier}
          watchers={canViewWatchers ? watcherList : []}
          candidates={canAddWatchers ? watcherCandidates : []}
          canView={canViewWatchers}
          canAdd={canAddWatchers}
          canRemove={canRemoveWatchers}
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {replies.map((reply) => (
          <li key={reply.id} id={`message-${reply.id}`} className="border rounded p-3 ml-6">
            <p className="text-xs text-gray-500">
              {userLabelById.get(reply.authorId) ?? ""} · {reply.createdAt.toISOString()}
            </p>
            <FormattedText project={project} text={reply.content} className="mt-1" />
            {messageAttachments(reply)}
            {messageActions(reply)}
          </li>
        ))}
      </ul>

      {!topic.locked && canPost ? (
        <section id="reply" className="border-t pt-4">
          <MessageForm
            projectIdentifier={identifier}
            boardId={board.id}
            parentId={topic.id}
            replySubject={replySubject}
            defaultContent={replyBody}
          />
        </section>
      ) : null}
    </main>
  );
}
