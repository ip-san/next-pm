import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { AddGroupMemberForm } from "./add-group-member-form";
import { AddMemberForm } from "./add-member-form";
import { RemoveMemberButton } from "./remove-member-button";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function MembersPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const canManageMembers = can({ permission: "manage_members", project: toAuthorizationProject(project), actor });
  if (!canManageMembers) {
    notFound();
  }

  const [members, roles, groups] = await Promise.all([
    new DrizzleMemberRepository().listByProject(project.id),
    new DrizzleRoleRepository().listAssignable(),
    new DrizzleGroupRepository().listAll(),
  ]);
  const users = await new DrizzleUserRepository().findByIds(memberUserIds(members));
  const userById = new Map(users.map((u) => [u.id, u]));
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  function principalLabel(member: (typeof members)[number]): string {
    if (member.groupId) {
      return `👥 ${groupById.get(member.groupId)?.name ?? "?"}`;
    }
    const memberUser = member.userId ? userById.get(member.userId) : undefined;
    const label = memberUser ? `${memberUser.login} (${memberUser.lastname} ${memberUser.firstname})` : "?";
    if (member.inheritedFromMemberId) {
      const via = memberById.get(member.inheritedFromMemberId);
      const groupName = via?.groupId ? groupById.get(via.groupId)?.name : undefined;
      return `${label}（${groupName ?? "グループ"}経由）`;
    }
    return label;
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name} — メンバー</h1>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">ユーザー / グループ</th>
            <th className="pr-4 py-1">ロール</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b">
              <td className="pr-4 py-1">{principalLabel(member)}</td>
              <td className="pr-4 py-1">{member.roleIds.map((roleId) => roleById.get(roleId)?.name ?? "?").join(", ")}</td>
              <td className="pr-4 py-1">
                <RemoveMemberButton projectIdentifier={identifier} memberId={member.id} />
              </td>
            </tr>
          ))}
          {members.length === 0 ? (
            <tr>
              <td colSpan={3} className="text-gray-400 py-2">
                メンバーはいません。
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <AddMemberForm projectIdentifier={identifier} roles={roles} />
      <AddGroupMemberForm projectIdentifier={identifier} groups={groups} roles={roles} />
    </main>
  );
}
