import Link from "next/link";
import { notFound } from "next/navigation";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { UserForm } from "../user-form";
import { UserMemberships } from "./user-memberships";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const actor = await currentUserFromCookies();
  if (!actor?.isAdmin) {
    notFound();
  }

  const memberRepository = new DrizzleMemberRepository();
  const [user, memberships, projects, roles] = await Promise.all([
    new DrizzleUserRepository().findById(userId),
    memberRepository.listByUser(userId),
    new DrizzleProjectRepository().listAll(),
    new DrizzleRoleRepository().listAssignable(),
  ]);
  // The anonymous placeholder is not an account and has no admin screen.
  if (!user || user.status === "anonymous") {
    notFound();
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const rows = memberships.map((member) => ({ member, project: projectById.get(member.projectId) }));
  const joinedProjectIds = new Set(memberships.map((member) => member.projectId));
  // Only ordinary roles are givable to a project member (Role.find_all_givable).
  const givableRoles = roles.filter((role) => role.builtin === 0);

  return (
    <main className="p-8 flex flex-col gap-8">
      <h1 className="text-xl font-semibold">
        ユーザー: {user.login} ({user.lastname} {user.firstname})
      </h1>
      <UserForm user={user} isSelf={user.id === actor.id} />
      <UserMemberships
        userId={user.id}
        rows={rows}
        roles={givableRoles}
        joinableProjects={projects.filter((project) => !joinedProjectIds.has(project.id))}
      />
      <Link href="/admin/users" className="text-sm text-blue-700 underline">
        一覧へ戻る
      </Link>
    </main>
  );
}
