import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { canEditTimeEntry } from "@/domain/time-entry/visibility";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";
import { canAccessTimeEntry } from "@/interface/http/time-entry-access";
import { DeleteTimeEntryButton } from "../../delete-time-entry-button";
import { TimeEntryForm } from "../../time-entry-form";

// Mirrors TimelogController#edit: find_time_entry then check_editability. The read half is
// `canAccessTimeEntry`, the same predicate the list, the CSV export and the REST endpoints
// apply, so an entry the actor couldn't have found in the list — including one booked
// against a private issue they can't see — isn't reachable here by id either. Both halves
// collapse to notFound(): an entry the actor may not see must not be distinguishable from
// one that doesn't exist.
export default async function EditTimeEntryPage({
  params,
}: {
  params: Promise<{ identifier: string; entryId: string }>;
}) {
  const { identifier, entryId } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  if (!user) {
    notFound();
  }

  const entry = await new DrizzleTimeEntryRepository().findById(entryId);
  if (!entry || entry.projectId !== project.id) {
    notFound();
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  const issueRepository = new DrizzleIssueRepository();
  const entryIssue = entry.issueId ? await issueRepository.findById(entry.issueId) : null;
  const visible = canAccessTimeEntry(entry, {
    userId: user.id,
    actor,
    userGroupIds,
    projectContext,
    issueById: new Map(entryIssue ? [[entryIssue.id, entryIssue]] : []),
  });
  if (
    !canEditTimeEntry({
      entry,
      userId: user.id,
      visible,
      canEditTimeEntries: can({ permission: "edit_time_entries", project: projectContext, actor }),
      canEditOwnTimeEntries: can({ permission: "edit_own_time_entries", project: projectContext, actor }),
    })
  ) {
    notFound();
  }

  const [allIssues, activities, customFields, values] = await Promise.all([
    issueRepository.listByProject(project.id),
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
    new DrizzleCustomFieldRepository().listForCustomizedType("TimeEntry"),
    new DrizzleCustomValueRepository().listForCustomized("TimeEntry", entry.id),
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
        <h1 className="text-xl font-semibold">{project.name} — 工数の編集</h1>
        <Link href={`/projects/${identifier}/time-entries`} className="text-sm underline">
          工数一覧
        </Link>
      </div>
      <TimeEntryForm
        projectIdentifier={identifier}
        issues={issues.map((issue) => ({ id: issue.id, subject: issue.subject }))}
        activities={activities}
        customFields={customFields}
        assignableUsers={assignableUsers}
        currentUserId={user.id}
        entry={entry}
        customValues={Object.fromEntries(values.map((value) => [value.customFieldId, value.value]))}
      />
      <DeleteTimeEntryButton projectIdentifier={identifier} entryId={entry.id} />
    </main>
  );
}
