import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { createIssue } from "@/application/issues/create-issue";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
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

  const visibilityRoles = issuesVisibilityRoles(actor);
  const allIssues = await new DrizzleIssueRepository().listByProject(project.id);
  const issues = allIssues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, visibilityRoles));
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
  fixed_version_id: z.string().uuid().nullable().default(null),
  category_id: z.string().uuid().nullable().default(null),
  is_private: z.boolean().default(false),
  estimated_hours: z.number().nullable().default(null),
  start_date: z.string().nullable().default(null),
  due_date: z.string().nullable().default(null),
  custom_field_values: z.record(z.string(), z.string()).default({}),
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

  // Validated before the issue is created — never persist an issue that a caller's own
  // 422 response says failed. setIssueCustomFieldValues only validates keys present in its
  // input (partial-update semantics, needed so PATCH doesn't reject unrelated already-set
  // required fields); at create time we want every applicable field considered, so a
  // required field the caller omitted entirely is still caught — hence filling in "" for
  // anything not explicitly provided before validating.
  const customFieldRepository = new DrizzleCustomFieldRepository();
  const applicableFields = await customFieldRepository.listForTracker(parsed.data.tracker_id);
  const customFieldValuesForCreate = Object.fromEntries(
    applicableFields.map((field) => [field.id, parsed.data.custom_field_values[field.id] ?? ""]),
  );
  const { fieldErrors, coerced } = validateCustomFieldValues(applicableFields, customFieldValuesForCreate);
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ error: "invalid_custom_field_values", details: fieldErrors }, { status: 422 });
  }

  if (parsed.data.fixed_version_id) {
    // Mirrors Redmine's Issue#validate_fixed_version — a version is assignable if it's
    // shared with (not just owned by) this issue's project, per its sharing setting.
    const sharedVersions = await new DrizzleVersionRepository().listSharedWith(project.id);
    if (!sharedVersions.some((version) => version.id === parsed.data.fixed_version_id)) {
      return NextResponse.json({ error: "invalid_fixed_version" }, { status: 422 });
    }
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
      fixedVersionId: parsed.data.fixed_version_id,
      categoryId: parsed.data.category_id,
      isPrivate: parsed.data.is_private,
      estimatedHours: parsed.data.estimated_hours,
      startDate: parsed.data.start_date,
      dueDate: parsed.data.due_date,
    },
  );

  const customValueRepository = new DrizzleCustomValueRepository();
  for (const { customFieldId, value } of coerced) {
    await customValueRepository.set(customFieldId, "Issue", issue.id, value);
  }

  return NextResponse.json({ issue }, { status: 201 });
}
