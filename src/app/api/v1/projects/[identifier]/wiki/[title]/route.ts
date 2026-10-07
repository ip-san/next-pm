import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { filterMembersWithPermission, memberUserIds } from "@/domain/member/entity";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { InvalidReassignTargetError, deleteWikiPage } from "@/application/wiki/delete-wiki-page";
import { resolveWikiPage } from "@/application/wiki/resolve-wiki-page";
import { WikiPageProtectedError, saveWikiPage } from "@/application/wiki/save-wiki-page";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import {
  DrizzleWikiContentRepository,
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

/** Mirrors the gate on projects/[identifier]/wiki/[title]/page.tsx: view_wiki_pages, nothing else. */
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string; title: string }> }) {
  const { identifier, title: rawTitle } = await params;
  const title = decodeURIComponent(rawTitle);

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const resolved = await resolveWikiPage(
    { wikiPageRepository: new DrizzleWikiPageRepository(), wikiRedirectRepository: new DrizzleWikiRedirectRepository() },
    project.id,
    title,
  );
  if (!resolved) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (resolved.redirected) {
    return NextResponse.redirect(new URL(`/api/v1/projects/${identifier}/wiki/${encodeURIComponent(resolved.page.title)}`, request.url));
  }
  const wikiPage = resolved.page;
  const current = await new DrizzleWikiContentRepository().findCurrent(wikiPage.id);
  if (!current) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ wiki_page: wikiPage, current_version: current });
}

const updateWikiPageSchema = z.object({
  text: z.string(),
  comments: z.string().default(""),
});

// Mirrors saveWikiPageAction: PUT creates the page (version 1) if `title` doesn't exist yet,
// otherwise appends a new version — Redmine's own wiki_pages/:title.json PUT does the same
// create-or-update.
export async function PUT(request: Request, { params }: { params: Promise<{ identifier: string; title: string }> }) {
  const { identifier, title: rawTitle } = await params;
  const title = decodeURIComponent(rawTitle);
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "edit_wiki_pages", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateWikiPageSchema.safeParse((await request.json().catch(() => null))?.wiki_page);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  let page;
  try {
    ({ page } = await saveWikiPage(
      { wikiPageRepository: new DrizzleWikiPageRepository(), wikiContentRepository: new DrizzleWikiContentRepository() },
      {
        projectId: project.id,
        title,
        text: parsed.data.text,
        comments: parsed.data.comments,
        authorId: user.id,
        parentId: null,
        canProtect: can({ permission: "protect_wiki_pages", project: toAuthorizationProject(project), actor }),
      },
    ));
  } catch (error) {
    if (error instanceof WikiPageProtectedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const rolesById = new Map(
    (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [role.id, role]),
  );
  const notifiableMembers = filterMembersWithPermission(members, rolesById, "view_wiki_pages");
  const watcherUserIds = await new DrizzleWatcherRepository().listWatcherUserIds("WikiPage", page.id);
  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [memberUserIds(notifiableMembers), watcherUserIds],
      excludeUserId: user.id,
      subject: `[${project.name}] ${page.title}`,
      body: parsed.data.text,
    },
  );

  return new NextResponse(null, { status: 204 });
}

// Mirrors WikiController#destroy for an API request: delete_wiki_pages plus the page's own
// protection gate. Redmine's API path never renders the confirmation form, so children fall
// through to the default disposition (nullify) unless ?todo= says otherwise.
export async function DELETE(request: Request, { params }: { params: Promise<{ identifier: string; title: string }> }) {
  const { identifier, title: rawTitle } = await params;
  const title = decodeURIComponent(rawTitle);
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "delete_wiki_pages", project: projectContext, actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const wikiPageRepository = new DrizzleWikiPageRepository();
  const page = await wikiPageRepository.findByTitle(project.id, title);
  if (!page) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const todo = new URL(request.url).searchParams.get("todo");
  const parsedTodo = z.enum(["nullify", "destroy", "reassign"]).safeParse(todo ?? "nullify");
  if (!parsedTodo.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  }

  try {
    await deleteWikiPage(
      {
        wikiPageRepository,
        wikiRedirectRepository: new DrizzleWikiRedirectRepository(),
        attachmentRepository: new DrizzleAttachmentRepository(),
        attachmentStorage: new FsAttachmentStore(),
        watcherRepository: new DrizzleWatcherRepository(),
      },
      {
        pageId: page.id,
        childrenDisposition: parsedTodo.data,
        reassignToId: new URL(request.url).searchParams.get("reassign_to_id"),
        canProtect: can({ permission: "protect_wiki_pages", project: projectContext, actor }),
      },
    );
  } catch (error) {
    if (error instanceof WikiPageProtectedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof InvalidReassignTargetError) {
      return NextResponse.json({ error: "invalid_request", reason: error.reason }, { status: 422 });
    }
    throw error;
  }

  return new NextResponse(null, { status: 204 });
}
