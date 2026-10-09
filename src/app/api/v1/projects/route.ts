import { NextResponse } from "next/server";
import { z } from "zod";
import { PROJECT_MODULES } from "@/domain/authorization/permission-registry";
import { can } from "@/domain/authorization/authorization-service";
import { createProject, CreateProjectNotPermittedError } from "@/application/projects/create-project";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { paginate, parsePagination } from "@/interface/http/pagination";
import { resolveActor, resolveGlobalRoles, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";
import { localizeMessage } from "@/domain/i18n/error-messages";
import { localeForViewer } from "@/interface/http/locale";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}


/**
 * Mirrors Project.visible_condition (public, or the actor is a member/admin) by reusing the
 * same can({permission: "view_project"}) check every other read path already goes through,
 * rather than re-deriving a separate "visible projects" query.
 */
export async function GET(request: Request) {
  const { user } = await resolveUser(request);
  const allProjects = await new DrizzleProjectRepository().listAll();

  const visible = [];
  for (const project of allProjects) {
    const { actor } = await resolveActor(user, project.id);
    if (can({ permission: "view_project", project: toAuthorizationProject(project), actor })) {
      visible.push(project);
    }
  }

  const { items: projects, total_count, offset, limit } = paginate(visible, parsePagination(new URL(request.url)));
  return NextResponse.json({ projects, total_count, offset, limit });
}

const createProjectSchema = z.object({
  name: z.string().min(1),
  identifier: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  description: z.string().default(""),
  is_public: z.boolean().default(true),
  parent_id: z.string().uuid().nullable().default(null),
  enabled_modules: z.array(z.enum(PROJECT_MODULES)).default([]),
  tracker_ids: z.array(z.string().uuid()).default([]),
});

// Goes through the same use case as createProjectAction, so add_project /
// add_subprojects and the non-admin publicity/module rules apply here too — this endpoint
// used to be admin-only, which Redmine's is not (ProjectsController#create is
// authorize_global, with accept_api_auth :create).
export async function POST(request: Request) {
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const parsed = createProjectSchema.safeParse((await request.json().catch(() => null))?.project);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  try {
    const project = await createProject(
      {
        projectRepository: new DrizzleProjectRepository(),
        memberRepository: new DrizzleMemberRepository(),
        roleRepository: new DrizzleRoleRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
      },
      {
        name: parsed.data.name,
        identifier: parsed.data.identifier,
        description: parsed.data.description,
        isPublic: parsed.data.is_public,
        parentId: parsed.data.parent_id,
        enabledModules: parsed.data.enabled_modules,
        trackerIds: parsed.data.tracker_ids,
        actingUserId: user.id,
        isAdmin: user.isAdmin,
        globalRoles: await resolveGlobalRoles(user),
        parentActor: parsed.data.parent_id ? (await resolveActor(user, parsed.data.parent_id)).actor : null,
      },
    );
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof CreateProjectNotPermittedError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? localizeMessage(await localeForViewer(user), error.message) : "invalid_request" }, { status: 422 });
  }
}
