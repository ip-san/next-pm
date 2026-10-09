import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";
import { TimeEntryForm } from "../time-entry-form";

// Redmine's timelog/new reached from a project (no issue in the URL): the issue is optional,
// so time can be booked against the project itself.
export default async function NewTimeEntryPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  if (!user) {
    notFound();
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds, roleIds } = await resolveActor(user, project.id);
  if (!can({ permission: "log_time", project: projectContext, actor })) {
    notFound();
  }

  const [allIssues, activities, customFields] = await Promise.all([
    new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
    new DrizzleCustomFieldRepository().listForCustomizedType("TimeEntry"),
  ]);
  const issues = allIssues.filter(visibleIssueFilter(user.id, actor, userGroupIds));

  const assignableUsers = can({ permission: "log_time_for_other_users", project: projectContext, actor })
    ? (
        await listAssignableTimeEntryUsers(
          {
            memberRepository: new DrizzleMemberRepository(),
            roleRepository: new DrizzleRoleRepository(),
            userRepository: new DrizzleUserRepository(),
          },
          project.id,
          user,
        )
      ).map((candidate) => ({ id: candidate.id, name: `${candidate.lastname} ${candidate.firstname}` }))
    : [];

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — 工数の記録</h1>
        <Link href={`/projects/${identifier}/time-entries`} className="text-sm underline">
          工数一覧
        </Link>
      </div>
      <TimeEntryForm
        projectIdentifier={identifier}
        issues={issues.map((issue) => ({ id: issue.id, number: issue.number, subject: issue.subject }))}
        activities={activities}
        customFields={visibleCustomFieldsFor(customFields, customFieldViewerFor(user, roleIds))}
        assignableUsers={assignableUsers}
        currentUserId={user.id}
      />
    </main>
  );
}
