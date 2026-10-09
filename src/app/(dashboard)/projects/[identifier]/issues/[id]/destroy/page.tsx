import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { collectSelfAndDescendantIds } from "@/domain/issue/parent";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";
import { DeleteIssueForm } from "./delete-issue-form";

export default async function DeleteIssuePage({ params }: { params: Promise<{ identifier: string; id: string }> }) {
  const { identifier, id } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const issueRepository = new DrizzleIssueRepository();
  const issue = await issueRepository.findById(id);
  if (!issue || issue.projectId !== project.id) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (
    !isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, issuesVisibilityRoles(actor)) ||
    !can({ permission: "delete_issues", project: toAuthorizationProject(project), actor })
  ) {
    notFound();
  }

  const projectIssues = await issueRepository.listByProject(project.id);
  const doomedIds = collectSelfAndDescendantIds(
    issue.id,
    new Map(projectIssues.map((candidate) => [candidate.id, candidate.parentId])),
  );

  // The time-entry question covers the whole subtree, as Redmine's destroy does.
  const timeEntries = await new DrizzleTimeEntryRepository().listForIssues(doomedIds);
  const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0);

  const isVisibleToActor = visibleIssueFilter(user?.id ?? null, actor, userGroupIds);
  const reassignCandidates = projectIssues
    .filter((candidate) => !doomedIds.includes(candidate.id) && isVisibleToActor(candidate))
    .map((candidate) => ({ id: candidate.id, number: candidate.number, subject: candidate.subject }));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">チケットの削除</h1>
      <DeleteIssueForm
        issueId={issue.id}
        projectIdentifier={identifier}
        subject={issue.subject}
        descendantCount={doomedIds.length - 1}
        totalHours={totalHours}
        reassignCandidates={reassignCandidates}
      />
    </main>
  );
}
