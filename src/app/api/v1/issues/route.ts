import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { createIssue } from "@/application/issues/create-issue";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const { user } = await resolveUser(request);
  const project = await new DrizzleProjectRepository().findById(projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const issues = await new DrizzleIssueRepository().listByProject(project.id);
  return NextResponse.json({ issues });
}

const createIssueSchema = z.object({
  project_id: z.string().uuid(),
  tracker_id: z.string().uuid(),
  priority_id: z.string().uuid(),
  subject: z.string().min(1),
  description: z.string().default(""),
  assigned_to_id: z.string().uuid().nullable().default(null),
  parent_id: z.string().uuid().nullable().default(null),
  category_id: z.string().uuid().nullable().default(null),
  is_private: z.boolean().default(false),
  estimated_hours: z.number().nullable().default(null),
  start_date: z.string().nullable().default(null),
  due_date: z.string().nullable().default(null),
});

export async function POST(request: Request) {
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const parsed = createIssueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const project = await new DrizzleProjectRepository().findById(parsed.data.project_id);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "add_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const issue = await createIssue(
    { issueRepository: new DrizzleIssueRepository(), trackerRepository: new DrizzleTrackerRepository() },
    {
      projectId: parsed.data.project_id,
      trackerId: parsed.data.tracker_id,
      priorityId: parsed.data.priority_id,
      subject: parsed.data.subject,
      description: parsed.data.description,
      authorId: user.id,
      assignedToId: parsed.data.assigned_to_id,
      parentId: parsed.data.parent_id,
      categoryId: parsed.data.category_id,
      isPrivate: parsed.data.is_private,
      estimatedHours: parsed.data.estimated_hours,
      startDate: parsed.data.start_date,
      dueDate: parsed.data.due_date,
    },
  );

  return NextResponse.json({ issue }, { status: 201 });
}
