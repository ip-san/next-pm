import { notFound } from "next/navigation";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { NewIssueForm } from "./new-issue-form";

export default async function NewIssuePage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const [trackers, priorities, categories, versions, projectMembers] = await Promise.all([
    new DrizzleTrackerRepository().findByIds(project.trackerIds),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    new DrizzleVersionRepository().listSharedWith(project.id),
    new DrizzleMemberRepository().listByProject(project.id),
  ]);
  const members = await new DrizzleUserRepository().findByIds(projectMembers.map((member) => member.userId));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name} — 新しいチケット</h1>
      <NewIssueForm
        identifier={identifier}
        projectId={project.id}
        trackers={trackers}
        priorities={priorities}
        members={members}
        categories={categories}
        versions={versions}
      />
    </main>
  );
}
