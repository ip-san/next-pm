import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ProjectSettingsTabs } from "../../project-settings-tabs";
import { IssueCategoryCreateForm } from "./issue-category-create-form";

export const dynamic = "force-dynamic";

export default async function IssueCategoriesPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "manage_issue_categories", project: projectContext, actor })) {
    notFound();
  }

  const [categories, projectMembers] = await Promise.all([
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    new DrizzleMemberRepository().listByProject(project.id),
  ]);
  const members = await new DrizzleUserRepository().findByIds(memberUserIds(projectMembers));
  const memberById = new Map(members.map((member) => [member.id, member]));

  const hasWiki = project.enabledModules.includes("wiki");

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "issueCategories.title"), { project: project.name })}</h1>
      <ProjectSettingsTabs locale={locale}
        identifier={identifier}
        active="issueCategories"
        visibleTabs={{
          settings: can({ permission: "edit_project", project: projectContext, actor }),
          members: can({ permission: "manage_members", project: projectContext, actor }),
          versions: can({ permission: "view_issues", project: projectContext, actor }),
          issueCategories: true,
          repositories: can({ permission: "manage_repository", project: projectContext, actor }),
          activities: can({ permission: "manage_project_activities", project: projectContext, actor }),
          wiki: hasWiki && can({ permission: "manage_wiki", project: projectContext, actor }),
        }}
      />

      <table className="text-sm w-full">
        <thead>
          <tr className="text-left border-b">
            <th className="pb-2">{translate(locale, "issueCategories.name")}</th>
            <th className="pb-2">{translate(locale, "issueCategories.defaultAssignee")}</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const assignee = category.assignedToId ? memberById.get(category.assignedToId) : null;
            return (
              <tr key={category.id} className="border-b">
                <td className="py-2">{category.name}</td>
                <td className="py-2">{assignee ? `${assignee.lastname} ${assignee.firstname}` : "-"}</td>
                <td className="py-2">
                  <Link href={`/projects/${identifier}/issue-categories/${category.id}`} className="underline">
                    {translate(locale, "issue.edit")}
                  </Link>
                </td>
              </tr>
            );
          })}
          {categories.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-2 text-gray-500">
                {translate(locale, "issueCategories.none")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <IssueCategoryCreateForm locale={locale} projectIdentifier={identifier} members={members} />
    </main>
  );
}
