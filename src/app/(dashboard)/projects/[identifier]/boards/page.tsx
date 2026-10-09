import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { boardTree, validParents } from "@/domain/board/tree";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { BoardAdminControls } from "./board-admin-controls";
import { currentLocale } from "@/interface/http/locale";
import { translate } from "@/domain/i18n/messages";
import { BoardCreateForm } from "./board-create-form";

export const dynamic = "force-dynamic";

export default async function BoardsPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
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
  // Redmine renders this list through `render_boards_tree`, which indents each level.
  const tree = boardTree(boards);
  const siblingCount = (parentId: string | null) => boards.filter((board) => board.parentId === parentId).length;

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{translate(locale, "boards.title")}</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {tree.map(({ board, level }) => (
          <li key={board.id} className="border rounded p-3" style={{ marginLeft: level * 16 }}>
            <Link href={`/projects/${identifier}/boards/${board.id}`} className="font-medium underline">
              {board.name}
            </Link>
            <p className="text-gray-600">{board.description}</p>
            {canManageBoards ? (
              <div className="mt-2">
                <BoardAdminControls
                  projectIdentifier={identifier}
                  board={board}
                  parentOptions={validParents(boards, board.id).map((candidate) => ({ id: candidate.id, label: candidate.name }))}
                  canMoveUp={board.position > 1}
                  canMoveDown={board.position < siblingCount(board.parentId)}
                  locale={locale}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canManageBoards ? (
        <BoardCreateForm
          projectIdentifier={identifier}
          parentOptions={boards.map((board) => ({ id: board.id, label: board.name }))}
          locale={locale}
        />
      ) : null}
    </main>
  );
}
