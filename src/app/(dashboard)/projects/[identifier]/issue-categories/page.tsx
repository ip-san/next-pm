import Link from "next/link";
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

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name} — チケットカテゴリ</h1>
      <ProjectSettingsTabs
        identifier={identifier}
        active="issueCategories"
        visibleTabs={{
          settings: can({ permission: "edit_project", project: projectContext, actor }),
          members: can({ permission: "manage_members", project: projectContext, actor }),
          versions: can({ permission: "view_issues", project: projectContext, actor }),
          issueCategories: true,
        }}
      />

      <table className="text-sm w-full">
        <thead>
          <tr className="text-left border-b">
            <th className="pb-2">名前</th>
            <th className="pb-2">既定の担当者</th>
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
                    編集
                  </Link>
                </td>
              </tr>
            );
          })}
          {categories.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-2 text-gray-500">
                カテゴリはまだありません。
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <IssueCategoryCreateForm projectIdentifier={identifier} members={members} />
    </main>
  );
}
