import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { canDeleteMessage } from "@/domain/message/authorization";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

export async function DELETE(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const messageRepository = new DrizzleMessageRepository();
  const message = await messageRepository.findById(messageId);
  if (!message) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const board = await new DrizzleBoardRepository().findById(message.boardId);
  if (!board) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(board.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  const hasDeleteMessages = can({ permission: "delete_messages", project: projectContext, actor });
  const hasDeleteOwnMessages = can({ permission: "delete_own_messages", project: projectContext, actor });
  if (!canDeleteMessage(message, user.id, hasDeleteMessages, hasDeleteOwnMessages)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await messageRepository.delete(message.id);
  return new NextResponse(null, { status: 204 });
}
