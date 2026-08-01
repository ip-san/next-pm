import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { InvalidMessageError, LockedTopicError, postMessage } from "@/application/messages/post-message";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
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

/** Mirrors the gate on boards/[boardId]/page.tsx: view_messages, nothing else. */
export async function GET(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;

  const board = await new DrizzleBoardRepository().findById(boardId);
  if (!board) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(board.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_messages", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const topics = await new DrizzleMessageRepository().listTopicsByBoard(board.id);
  return NextResponse.json({ messages: topics });
}

const postMessageSchema = z.object({
  parent_id: z.string().uuid().nullable().default(null),
  subject: z.string().min(1),
  content: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const board = await new DrizzleBoardRepository().findById(boardId);
  if (!board) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const project = await new DrizzleProjectRepository().findById(board.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "add_messages", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = postMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  let message;
  try {
    message = await postMessage(
      { messageRepository: new DrizzleMessageRepository() },
      { boardId: board.id, parentId: parsed.data.parent_id, authorId: user.id, subject: parsed.data.subject, content: parsed.data.content },
    );
  } catch (error) {
    if (error instanceof InvalidMessageError || error instanceof LockedTopicError) {
      return NextResponse.json({ error: "invalid_message", message: error.message }, { status: 422 });
    }
    throw error;
  }

  const members = await new DrizzleMemberRepository().listByProject(project.id);
  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    { recipientGroups: [memberUserIds(members)], excludeUserId: user.id, subject: `[${project.name}] ${message.subject}`, body: message.content },
  );

  return NextResponse.json({ message }, { status: 201 });
}
