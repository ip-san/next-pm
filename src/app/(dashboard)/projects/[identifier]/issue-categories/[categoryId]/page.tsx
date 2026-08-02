import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { DeleteIssueCategoryButton } from "./delete-issue-category-button";
import { IssueCategoryEditForm } from "./issue-category-edit-form";

export const dynamic = "force-dynamic";

export default async function IssueCategoryDetailPage({ params }: { params: Promise<{ identifier: string; categoryId: string }> }) {
  const { identifier, categoryId } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_issue_categories", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const category = await new DrizzleIssueCategoryRepository().findById(categoryId);
  if (!category || category.projectId !== project.id) {
    notFound();
  }

  const projectMembers = await new DrizzleMemberRepository().listByProject(project.id);
  const members = await new DrizzleUserRepository().findByIds(memberUserIds(projectMembers));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">カテゴリを編集</h1>
      <IssueCategoryEditForm projectIdentifier={identifier} category={category} members={members} />
      <div className="border-t pt-4">
        <DeleteIssueCategoryButton projectIdentifier={identifier} categoryId={category.id} />
      </div>
    </main>
  );
}
