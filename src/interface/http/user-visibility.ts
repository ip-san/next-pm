import { memberUserIds } from "@/domain/member/entity";
import { canSeeUser, viewAllActiveUsers } from "@/domain/user/visibility";
import type { User } from "@/domain/user/entity";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { listVisibleProjectContexts } from "@/interface/http/resolve-actor";

/**
 * Builds the "can `viewer` see this user" check once per request, so every lookup on the page
 * shares one set of memberships and projects. Redmine decides `view_all_active` from the roles
 * of the viewer's memberships, and falls back to the builtin role for someone with none.
 */
export async function userVisibilityFor(viewer: User | null): Promise<(targetId: string) => boolean> {
  if (viewer?.isAdmin) {
    return () => true;
  }

  const roleRepository = new DrizzleRoleRepository();
  const memberships = viewer ? await new DrizzleMemberRepository().listByUser(viewer.id) : [];
  const roles =
    memberships.length > 0
      ? await roleRepository.findByIds([...new Set(memberships.flatMap((membership) => membership.roleIds))])
      : [viewer ? await roleRepository.findBuiltinNonMember() : await roleRepository.findBuiltinAnonymous()];
  const viewAllActive = viewAllActiveUsers(roles);

  const membersOfVisibleProjects = new Set<string>();
  if (!viewAllActive) {
    const projects = await listVisibleProjectContexts(viewer, "view_project");
    const memberLists = await Promise.all(projects.map((entry) => new DrizzleMemberRepository().listByProject(entry.project.id)));
    for (const id of memberLists.flatMap((members) => memberUserIds(members))) {
      membersOfVisibleProjects.add(id);
    }
  }

  return (targetId) =>
    canSeeUser({ viewerId: viewer?.id ?? null, isAdmin: false, viewAllActive, membersOfVisibleProjects }, targetId);
}
