import type { User } from "@/domain/user/entity";
import { actorIssuesVisibilityRoles, can, projectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { PermissionKey } from "@/domain/authorization/permission-registry";
import type { JournalViewer } from "@/domain/journal/visibility";
import type { Project } from "@/domain/project/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { IssuesVisibility } from "@/domain/role/entity";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";

export interface ResolvedActor {
  actor: AuthorizationActor;
  /** Role ids to feed into workflow transition checks — mirrors Issue#roles_for_workflow. */
  roleIds: string[];
  /** Group ids `user` belongs to — feeds `visibleIssueFilter`/`isPrivateIssueVisible` for group-assigned private issues. Empty for anonymous. */
  userGroupIds: string[];
}

export function toAuthorizationProject(project: {
  status: string;
  isPublic: boolean;
  enabledModules: string[];
}): ProjectAuthorizationContext {
  return projectAuthorizationContext(project);
}

/** Resolves which roles/actor-kind apply to `user` for `projectId`, mirroring User#allowed_to?'s role resolution. */
export async function resolveActor(user: User | null, projectId: string): Promise<ResolvedActor> {
  const roleRepository = new DrizzleRoleRepository();

  if (!user) {
    const anonymous = await roleRepository.findBuiltinAnonymous();
    return { actor: { kind: "anonymous", role: anonymous }, roleIds: [anonymous.id], userGroupIds: [] };
  }

  const userGroupIds = await new DrizzleGroupRepository().listGroupIdsForUser(user.id);

  if (user.isAdmin) {
    const allRoles = await roleRepository.listAssignable();
    return { actor: { kind: "admin" }, roleIds: allRoles.map((r) => r.id), userGroupIds };
  }

  const member = await new DrizzleMemberRepository().findByUserAndProject(user.id, projectId);
  if (member) {
    const roles = await roleRepository.findByIds(member.roleIds);
    return { actor: { kind: "member", roles }, roleIds: roles.map((r) => r.id), userGroupIds };
  }

  const nonMember = await roleRepository.findBuiltinNonMember();
  return { actor: { kind: "non_member", role: nonMember }, roleIds: [nonMember.id], userGroupIds };
}

/**
 * Roles to feed into `isPrivateIssueVisible`. An admin actor carries no real roles here,
 * but Redmine's admin bypass means an admin must always pass the private-issue check too
 * — so this returns a synthetic `{issuesVisibility: "all"}` for admins rather than making
 * every call site special-case `actor.kind === "admin"`.
 */
export function issuesVisibilityRoles(actor: AuthorizationActor): { issuesVisibility: IssuesVisibility }[] {
  return actorIssuesVisibilityRoles(actor);
}

/**
 * Predicate for filtering any issue-bearing list (siblings, parent/child links, related
 * issues, roadmap/version rollups, ...) down to what `userId`/`actor` may actually see.
 * Every read path that reaches issues other than the one already gated by the page's own
 * `view_issues` + `isPrivateIssueVisible` check must run its results through this.
 */
export function visibleIssueFilter(
  userId: string | null,
  actor: AuthorizationActor,
  userGroupIds: string[],
): (issue: Pick<Issue, "isPrivate" | "authorId" | "assignedToId" | "assignedToType">) => boolean {
  const roles = issuesVisibilityRoles(actor);
  return (issue) => isPrivateIssueVisible(issue, userId, userGroupIds, roles);
}

/**
 * Projects where `user` holds `permission`, for pickers that must not reveal projects the
 * viewer has no business seeing — Redmine's `Issue.allowed_target_projects` is the same
 * idea (`Project.allowed_to_condition(user, :add_issues)`), and listing every project in a
 * move or copy dropdown would leak private project names.
 *
 * Resolves the actor per project because membership (and therefore the effective role set)
 * is per project; the project count this iterates over is the same one the projects index
 * already renders in full.
 */
export async function listProjectsWithPermission(
  user: User | null,
  permission: PermissionKey,
  options: { requireTrackers?: boolean } = {},
): Promise<Project[]> {
  const projects = await new DrizzleProjectRepository().listAll();
  const allowed: Project[] = [];
  for (const project of projects) {
    if (options.requireTrackers && project.trackerIds.length === 0) continue;
    const { actor } = await resolveActor(user, project.id);
    if (can({ permission, project: toAuthorizationProject(project), actor })) {
      allowed.push(project);
    }
  }
  return allowed;
}

/**
 * The viewer a journal read needs: who is asking, and whether they hold `view_private_notes`
 * on the project whose journals they're reading.
 */
export function journalViewerFor(
  userId: string | null,
  actor: AuthorizationActor,
  project: { status: string; isPublic: boolean; enabledModules: string[] },
): JournalViewer {
  return {
    userId,
    canViewPrivateNotes: can({ permission: "view_private_notes", project: toAuthorizationProject(project), actor }),
  };
}
