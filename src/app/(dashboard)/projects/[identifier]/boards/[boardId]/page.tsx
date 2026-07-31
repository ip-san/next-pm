import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { MessageForm } from "./message-form";

export const dynamic = "force-dynamic";

export default async function BoardDetailPage({ params }: { params: Promise<{ identifier: string; boardId: string }> }) {
  const { identifier, boardId } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_messages", project: toAuthorizationProject(project), actor })) {
    notFound();
  }
  const canPost = can({ permission: "add_messages", project: toAuthorizationProject(project), actor });

  const board = await new DrizzleBoardRepository().findById(boardId);
  if (!board || board.projectId !== project.id) {
    notFound();
  }

  const topics = await new DrizzleMessageRepository().listTopicsByBoard(board.id);

  return (
    <main className="p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{board.name}</h1>
        <p className="text-sm text-gray-600">{board.description}</p>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {topics.map((topic) => (
          <li key={topic.id} className="border rounded p-3">
            <Link href={`/projects/${identifier}/boards/${board.id}/messages/${topic.id}`} className="font-medium underline">
              {topic.sticky ? "📌 " : ""}
              {topic.subject}
            </Link>
            <p className="text-gray-500 text-xs">
              返信 {topic.repliesCount}件 · {topic.createdAt.toISOString()}
              {topic.locked ? " · ロック中" : ""}
            </p>
          </li>
        ))}
      </ul>

      {canPost ? (
        <section className="border-t pt-4">
          <h2 className="font-medium text-sm mb-2">新しいトピック</h2>
          <MessageForm projectIdentifier={identifier} boardId={board.id} parentId={null} />
        </section>
      ) : null}
    </main>
  );
}
