import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { filterMembersWithPermission, memberUserIds } from "@/domain/member/entity";
import { createNews, InvalidNewsError } from "@/application/news/create-news";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { triggerNewsWebhook } from "@/interface/http/webhook-trigger";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { paginate, parsePagination } from "@/interface/http/pagination";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

/** Mirrors the gate on projects/[identifier]/news/page.tsx: view_news, nothing else. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const project = await new DrizzleProjectRepository().findById(projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { user } = await resolveUser(request);
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_news", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const allNews = await new DrizzleNewsRepository().listByProject(project.id);
  const { items: news, total_count, offset, limit } = paginate(allNews, parsePagination(url));
  return NextResponse.json({ news, total_count, offset, limit });
}

const createNewsSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().default(""),
  description: z.string().min(1),
});

export async function POST(request: Request) {
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const parsed = createNewsSchema.safeParse((await request.json().catch(() => null))?.news);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const project = await new DrizzleProjectRepository().findById(parsed.data.project_id);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_news", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let created;
  try {
    created = await createNews(
      { newsRepository: new DrizzleNewsRepository() },
      { projectId: project.id, authorId: user.id, title: parsed.data.title, summary: parsed.data.summary, description: parsed.data.description },
    );
  } catch (error) {
    if (error instanceof InvalidNewsError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const rolesById = new Map(
    (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [role.id, role]),
  );
  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [memberUserIds(filterMembersWithPermission(members, rolesById, "view_news"))],
      excludeUserId: user.id,
      subject: `[${project.name}] ${created.title}`,
      body: created.description,
    },
  );

  await triggerNewsWebhook(project, created);

  return NextResponse.json({ news: created }, { status: 201 });
}
