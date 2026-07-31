import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { BoardCreateForm } from "./board-create-form";

export const dynamic = "force-dynamic";

export default async function BoardsPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_messages", project: toAuthorizationProject(project), actor })) {
    notFound();
  }
  const canManageBoards = can({ permission: "manage_boards", project: toAuthorizationProject(project), actor });

  const boards = await new DrizzleBoardRepository().listByProject(project.id);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">フォーラム</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {boards.map((board) => (
          <li key={board.id} className="border rounded p-3">
            <Link href={`/projects/${identifier}/boards/${board.id}`} className="font-medium underline">
              {board.name}
            </Link>
            <p className="text-gray-600">{board.description}</p>
          </li>
        ))}
      </ul>
      {canManageBoards ? <BoardCreateForm projectIdentifier={identifier} /> : null}
    </main>
  );
}
