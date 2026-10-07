import {
  can,
  canGlobally,
  projectAuthorizationContext,
  type AuthorizationActor,
} from "@/domain/authorization/authorization-service";
import type { MemberRepository } from "@/domain/member/repository";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import { hasPermission, type Role } from "@/domain/role/entity";
import type { RoleRepository } from "@/domain/role/repository";
import { resolveProjectDefaults } from "@/domain/settings/project-defaults";
import type { SettingsRepository } from "@/domain/settings/repository";

export class CreateProjectNotPermittedError extends Error {
  constructor() {
    super("The acting user may not create a project here.");
    this.name = "CreateProjectNotPermittedError";
  }
}

export interface CreateProjectRepositories {
  projectRepository: ProjectRepository;
  memberRepository: MemberRepository;
  roleRepository: RoleRepository;
  settingsRepository: SettingsRepository;
}

export interface CreateProjectInput {
  name: string;
  identifier: string;
  description: string;
  isPublic: boolean;
  parentId: string | null;
  enabledModules: string[];
  trackerIds: string[];
  actingUserId: string;
  isAdmin: boolean;
  /** Every role the actor holds anywhere plus their builtin role — see resolveGlobalRoles. */
  globalRoles: Pick<Role, "permissions">[];
  /**
   * The actor's resolved roles on the chosen parent, needed for `add_subprojects`. Null when
   * creating a root project; the caller resolves it because membership is per project.
   */
  parentActor: AuthorizationActor | null;
}

/**
 * Redmine's `Project.default_member_role`: the role named by `new_project_user_role_id`, or
 * the first assignable one. It is both the role a non-admin creator is given and — per
 * Project's `safe_attributes :if` blocks — the role whose permissions decide whether a
 * non-admin may choose the new project's publicity and modules at all.
 */
export function defaultMemberRole(assignableRoles: Role[], configuredRoleId: string | null): Role | null {
  return assignableRoles.find((role) => role.id === configuredRoleId) ?? assignableRoles[0] ?? null;
}

/**
 * Redmine's ProjectsController#new/#create. Three rules beyond "insert a row", all of which
 * next-pm previously sidestepped by making project creation admin-only:
 *
 * 1. Who may create. `authorize_global` passes on `add_project` held anywhere, and a
 *    subproject additionally needs `add_subprojects` on the chosen parent.
 * 2. What a non-admin may choose. `is_public` and `enabled_module_names` are safe
 *    attributes only if the *default member role* holds select_project_publicity /
 *    select_project_modules; otherwise the submitted values are discarded in favour of the
 *    `default_projects_*` settings. Discarding matters: an unchecked checkbox and a
 *    withheld checkbox look identical in a form post, so trusting the submission would
 *    quietly make every project a non-admin creates private.
 * 3. `add_default_member` — a non-admin creator is made a member of what they just
 *    created, or they would immediately lose access to it.
 */
export async function createProject(repositories: CreateProjectRepositories, input: CreateProjectInput): Promise<Project> {
  const { projectRepository } = repositories;

  const existing = await projectRepository.findByIdentifier(input.identifier);
  if (existing) {
    throw new Error(`Project identifier "${input.identifier}" is already taken`);
  }

  const parent = input.parentId ? await projectRepository.findById(input.parentId) : null;
  if (input.parentId && !parent) {
    throw new Error(`Parent project ${input.parentId} not found`);
  }

  if (parent) {
    const permitted =
      input.parentActor !== null &&
      can({ permission: "add_subprojects", project: projectAuthorizationContext(parent), actor: input.parentActor });
    if (!permitted) {
      throw new CreateProjectNotPermittedError();
    }
  } else if (!canGlobally({ permission: "add_project", isAdmin: input.isAdmin, roles: input.globalRoles })) {
    throw new CreateProjectNotPermittedError();
  }

  const defaults = resolveProjectDefaults(await repositories.settingsRepository.getAll());
  const assignableRoles = await repositories.roleRepository.listGivable();
  const creatorRole = defaultMemberRole(assignableRoles, defaults.newProjectUserRoleId);

  const mayChoose = (permission: "select_project_publicity" | "select_project_modules") =>
    input.isAdmin || (creatorRole !== null && hasPermission(creatorRole, permission));

  const project = await projectRepository.createUnderParent(
    {
      name: input.name,
      identifier: input.identifier,
      description: input.description,
      isPublic: mayChoose("select_project_publicity") ? input.isPublic : defaults.isPublic,
      status: "active",
      parentId: input.parentId,
      position: 0,
      enabledModules: mayChoose("select_project_modules") ? input.enabledModules : defaults.enabledModules,
      trackerIds: input.trackerIds,
    },
    input.parentId,
  );

  if (!input.isAdmin && creatorRole) {
    await repositories.memberRepository.create({
      userId: input.actingUserId,
      groupId: null,
      inheritedFromMemberId: null,
      projectId: project.id,
      roleIds: [creatorRole.id],
    });
  }

  return project;
}
