import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { compileFilters } from "@/domain/query/filter-builder";
import { isQueryVisible } from "@/domain/query/visibility";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

// Mirrors Redmine's queries.json: every saved query for a project, filtered down to
// what this actor may see — own private queries, "roles"-scoped queries matching one of
// their roles, and every public query. No admin bypass here (unlike most permission
// checks in this app): Query.visible_condition in Redmine still excludes other users'
// private queries even for an admin, so isQueryVisible is applied uniformly. An admin
// actor's roleIds already cover every assignable role (see resolveActor), which is what
// makes "roles"-visibility queries still show up for them without a special case.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const { user } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await new DrizzleProjectRepository().findById(projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor, roleIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const allQueries = await new DrizzleQueryRepository().listForProject(project.id);
  const queries = allQueries.filter((q) => isQueryVisible(q, user.id, roleIds));

  return NextResponse.json({ queries });
}

const filterConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["=", "!", "!*", "*", ">=", "<=", "><", "~", "!~"]),
  values: z.array(z.string()),
});

const createQuerySchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  visibility: z.enum(["private", "roles", "public"]).default("private"),
  role_ids: z.array(z.string().uuid()).default([]),
  filters: z.array(filterConditionSchema).default([]),
});

export async function POST(request: Request) {
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const parsed = createQuerySchema.safeParse((await request.json().catch(() => null))?.query);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  const project = await new DrizzleProjectRepository().findById(parsed.data.project_id);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // A "public"/"roles" query is visible to every other project member, so making one
  // requires more trust than just viewing the issue list it's built from. Redmine gates
  // this on a dedicated manage_public_queries permission, which isn't in this app's
  // permission registry — edit_issues is used as the closest existing proxy, a deliberate
  // simplification rather than silently allowing any viewer to publish a shared query.
  if (parsed.data.visibility !== "private" && !can({ permission: "edit_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    compileFilters(parsed.data.filters);
  } catch {
    return NextResponse.json({ error: "invalid_filters" }, { status: 422 });
  }

  if (parsed.data.visibility === "roles" && parsed.data.role_ids.length > 0) {
    const roles = await new DrizzleRoleRepository().findByIds(parsed.data.role_ids);
    if (roles.length !== parsed.data.role_ids.length) {
      return NextResponse.json({ error: "invalid_role_ids" }, { status: 422 });
    }
  }

  const query = await new DrizzleQueryRepository().create({
    name: parsed.data.name,
    projectId: project.id,
    userId: user.id,
    visibility: parsed.data.visibility,
    filters: parsed.data.filters,
    roleIds: parsed.data.role_ids,
  });

  return NextResponse.json({ query }, { status: 201 });
}
