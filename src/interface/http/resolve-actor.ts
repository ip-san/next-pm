import type { User } from "@/domain/user/entity";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { IssuesVisibility } from "@/domain/role/entity";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";

export interface ResolvedActor {
  actor: AuthorizationActor;
  /** Role ids to feed into workflow transition checks — mirrors Issue#roles_for_workflow. */
  roleIds: string[];
}

export function toAuthorizationProject(project: {
  status: string;
  isPublic: boolean;
  enabledModules: string[];
}): ProjectAuthorizationContext {
  return {
    isArchived: project.status === "archived",
    isActive: project.status === "active",
    isPublic: project.isPublic,
    enabledModules: project.enabledModules,
  };
}

/** Resolves which roles/actor-kind apply to `user` for `projectId`, mirroring User#allowed_to?'s role resolution. */
export async function resolveActor(user: User | null, projectId: string): Promise<ResolvedActor> {
  const roleRepository = new DrizzleRoleRepository();

  if (!user) {
    const anonymous = await roleRepository.findBuiltinAnonymous();
    return { actor: { kind: "anonymous", role: anonymous }, roleIds: [anonymous.id] };
  }

  if (user.isAdmin) {
    const allRoles = await roleRepository.listAssignable();
    return { actor: { kind: "admin" }, roleIds: allRoles.map((r) => r.id) };
  }

  const member = await new DrizzleMemberRepository().findByUserAndProject(user.id, projectId);
  if (member) {
    const roles = await roleRepository.findByIds(member.roleIds);
    return { actor: { kind: "member", roles }, roleIds: roles.map((r) => r.id) };
  }

  const nonMember = await roleRepository.findBuiltinNonMember();
  return { actor: { kind: "non_member", role: nonMember }, roleIds: [nonMember.id] };
}

/**
 * Roles to feed into `isPrivateIssueVisible`. An admin actor carries no real roles here,
 * but Redmine's admin bypass means an admin must always pass the private-issue check too
 * — so this returns a synthetic `{issuesVisibility: "all"}` for admins rather than making
 * every call site special-case `actor.kind === "admin"`.
 */
export function issuesVisibilityRoles(actor: AuthorizationActor): { issuesVisibility: IssuesVisibility }[] {
  switch (actor.kind) {
    case "admin":
      return [{ issuesVisibility: "all" }];
    case "member":
      return actor.roles;
    case "non_member":
    case "anonymous":
      return [actor.role];
  }
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
): (issue: Pick<Issue, "isPrivate" | "authorId" | "assignedToId">) => boolean {
  const roles = issuesVisibilityRoles(actor);
  return (issue) => isPrivateIssueVisible(issue, userId, roles);
}
