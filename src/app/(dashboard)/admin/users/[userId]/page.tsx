import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { loadAuthModeOptions } from "@/application/users/load-auth-mode-options";
import { ROLE_BUILTIN_MEMBER } from "@/domain/role/entity";
import { DrizzleLdapAuthSourceRepository } from "@/infrastructure/db/repositories/ldap-auth-source-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { UserForm } from "../user-form";
import { UserMemberships } from "./user-memberships";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const locale = await currentLocale();
  const { userId } = await params;
  const actor = await currentUserFromCookies();
  if (!actor?.isAdmin) {
    notFound();
  }

  const memberRepository = new DrizzleMemberRepository();
  const [user, memberships, projects, roles, authModeOptions] = await Promise.all([
    new DrizzleUserRepository().findById(userId),
    memberRepository.listByUser(userId),
    new DrizzleProjectRepository().listAll(),
    new DrizzleRoleRepository().listAll(),
    loadAuthModeOptions(new DrizzleLdapAuthSourceRepository(), process.env),
  ]);
  // The anonymous placeholder is not an account and has no admin screen.
  if (!user || user.status === "anonymous") {
    notFound();
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const rows = memberships.map((member) => ({ member, project: projectById.get(member.projectId) }));
  const joinedProjectIds = new Set(memberships.map((member) => member.projectId));
  // Redmine's Role.givable is `builtin = 0` — the `assignable` flag governs whether issues can
  // be assigned to the role's holders, not whether the role can be handed to a member.
  const givableRoles = roles.filter((role) => role.builtin === ROLE_BUILTIN_MEMBER);

  return (
    <main className="p-8 flex flex-col gap-8">
      <h1 className="text-xl font-semibold">
        {interpolate(translate(locale, "admin.users.editTitle"), { login: user.login, name: `${user.lastname} ${user.firstname}` })}
      </h1>
      <UserForm locale={locale} user={user} isSelf={user.id === actor.id} authModeOptions={authModeOptions} />
      <UserMemberships locale={locale}
        userId={user.id}
        rows={rows}
        roles={givableRoles}
        joinableProjects={projects.filter((project) => !joinedProjectIds.has(project.id))}
      />
      <Link href="/admin/users" className="text-sm text-blue-700 underline">
        {translate(locale, "admin.users.backToList")}
      </Link>
    </main>
  );
}
