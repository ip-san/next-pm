import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
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

  const [members, roles] = await Promise.all([
    new DrizzleMemberRepository().listByProject(project.id),
    new DrizzleRoleRepository().listAssignable(),
  ]);
  const users = await new DrizzleUserRepository().findByIds(members.map((m) => m.userId));
  const userById = new Map(users.map((u) => [u.id, u]));
  const roleById = new Map(roles.map((r) => [r.id, r]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name} — メンバー</h1>
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="pr-4 py-1">ユーザー</th>
            <th className="pr-4 py-1">ロール</th>
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const memberUser = userById.get(member.userId);
            return (
              <tr key={member.id} className="border-b">
                <td className="pr-4 py-1">{memberUser ? `${memberUser.login} (${memberUser.lastname} ${memberUser.firstname})` : "?"}</td>
                <td className="pr-4 py-1">
                  {member.roleIds.map((roleId) => roleById.get(roleId)?.name ?? "?").join(", ")}
                </td>
                <td className="pr-4 py-1">
                  <RemoveMemberButton projectIdentifier={identifier} memberId={member.id} />
                </td>
              </tr>
            );
          })}
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
    </main>
  );
}
