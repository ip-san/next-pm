import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { canEditTimeEntry } from "@/domain/time-entry/visibility";
import { loadProjectActivities } from "@/application/time-entries/project-activities";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { canAccessTimeEntry } from "@/interface/http/time-entry-access";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { BulkTimeEntryForm } from "./bulk-time-entry-form";

/**
 * Redmine's TimelogController#bulk_edit. Each entry is checked again when the change is saved
 * (bulkUpdateTimeEntriesAction), so this page lists the selection for the viewer and offers the form.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BulkEditTimeEntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const { ids } = await searchParams;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  const canEditTimeEntries = can({ permission: "edit_time_entries", project: projectContext, actor });
  const canEditOwnTimeEntries = can({ permission: "edit_own_time_entries", project: projectContext, actor });
  if (!canEditTimeEntries && !canEditOwnTimeEntries) {
    notFound();
  }

  // Only the entries the viewer may both see and edit are listed, with the same predicates the single
  // edit page applies, so a selection can't be used to read an entry's hours or comments.
  // Ids come from the query string; anything that isn't a uuid is dropped before it reaches the database.
  const requested = (Array.isArray(ids) ? ids : ids ? [ids] : []).filter((id) => UUID_PATTERN.test(id));
  const timeEntryRepository = new DrizzleTimeEntryRepository();
  const candidates = (await Promise.all(requested.map((id) => timeEntryRepository.findById(id))))
    .filter((entry) => entry !== null)
    .filter((entry) => entry.projectId === project.id);
  const issueIds = [...new Set(candidates.flatMap((entry) => (entry.issueId ? [entry.issueId] : [])))];
  const issueById = new Map((await new DrizzleIssueRepository().findByIds(issueIds)).map((issue) => [issue.id, issue]));
  const context = { userId: user?.id ?? null, actor, userGroupIds, projectContext, issueById };
  const entries = candidates.filter(
    (entry) =>
      canAccessTimeEntry(entry, context) &&
      canEditTimeEntry({ entry, userId: user?.id ?? null, visible: true, canEditTimeEntries, canEditOwnTimeEntries }),
  );

  const { offered } = await loadProjectActivities(
    { enumerationRepository: new DrizzleEnumerationRepository(), projectActivityRepository: new DrizzleProjectActivityRepository() },
    project.id,
  );

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "bulkEdit.timeEntriesTitle"), { project: project.name, count: entries.length })}</h1>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-600">{translate(locale, "bulkEdit.timeEntriesNone")}</p>
      ) : (
        <>
          <ul className="text-sm text-gray-600 flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.id}>
                {entry.spentOn} {entry.hours}h {entry.comments ? `— ${entry.comments}` : ""}
              </li>
            ))}
          </ul>
          <BulkTimeEntryForm
            projectIdentifier={identifier}
            entryIds={entries.map((entry) => entry.id)}
            activities={offered.map((activity) => ({ id: activity.id, name: activity.name }))}
            locale={locale}
          />
        </>
      )}
    </main>
  );
}
