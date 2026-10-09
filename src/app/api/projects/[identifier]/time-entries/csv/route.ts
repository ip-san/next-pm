import { customFieldsVisibleInEveryScope } from "@/domain/custom-field/visibility";
import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { encodeCsv } from "@/domain/csv/encode";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { filterAccessibleTimeEntries } from "@/interface/http/time-entry-access";
import { timeEntryScopesFor } from "@/interface/http/time-entry-list";

export const dynamic = "force-dynamic";

// Cookie-authed download endpoint serving the time-entry list's "CSV" link — same pattern
// and placement as the issues CSV route (outside /api/v1, which is the Bearer/Basic REST
// surface). Mirrors the list page's visibility filtering exactly, so the export never
// contains a row the viewer can't already see on screen. Column names match the importer's
// so an export can be edited and fed straight back in.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await currentUserFromCookies();
  const projectContext = toAuthorizationProject(project);
  const resolved = await resolveActor(user, project.id);
  const { actor } = resolved;
  if (!can({ permission: "view_time_entries", project: projectContext, actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Same subtree as the list page (display_subprojects_issues); each project's entries are filtered by its own rules.
  const scopes = await timeEntryScopesFor(user, { ...resolved, project, projectContext });
  const [scopedEntries, activities, allCustomFields] = await Promise.all([
    Promise.all(scopes.map(async (scope) => ({ scope, rows: await new DrizzleTimeEntryRepository().listForProject(scope.project.id) }))),
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
    new DrizzleCustomFieldRepository().listForCustomizedType("TimeEntry"),
  ]);
  const allEntries = scopedEntries.flatMap(({ rows }) => rows);
  // A field the viewer sees in every scope of this export (customFieldsVisibleInEveryScope): the same rule as the list.
  const customFields = customFieldsVisibleInEveryScope(
    allCustomFields,
    scopes.map((scope) => customFieldViewerFor(user, scope.roleIds)),
  );

  const issueRepository = new DrizzleIssueRepository();
  const issueIds = [...new Set(allEntries.map((entry) => entry.issueId).filter((id): id is string => id !== null))];
  const issues = await Promise.all(issueIds.map((id) => issueRepository.findById(id)));
  const issueById = new Map(issues.filter((issue) => issue !== null).map((issue) => [issue.id, issue]));

  const entries = scopedEntries.flatMap(({ scope, rows }) =>
    filterAccessibleTimeEntries(rows, {
      userId: user?.id ?? null,
      actor: scope.actor,
      userGroupIds: scope.userGroupIds,
      projectContext: scope.projectContext,
      issueById,
    }),
  );

  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const entryUsers = await new DrizzleUserRepository().findByIds([...new Set(entries.map((entry) => entry.userId))]);
  const loginById = new Map(entryUsers.map((u) => [u.id, u.login]));

  const customValueRepository = new DrizzleCustomValueRepository();
  const valuesByEntry = new Map(
    await Promise.all(
      entries.map(
        async (entry) =>
          [
            entry.id,
            new Map((await customValueRepository.listForCustomized("TimeEntry", entry.id)).map((v) => [v.customFieldId, v.value])),
          ] as const,
      ),
    ),
  );

  const rows = [
    ["spent_on", "user", "issue_id", "activity", "hours", "comments", ...customFields.map((field) => field.name)],
    ...entries.map((entry) => [
      entry.spentOn,
      loginById.get(entry.userId) ?? "",
      entry.issueId ?? "",
      activityById.get(entry.activityId)?.name ?? "",
      String(entry.hours),
      entry.comments,
      ...customFields.map((field) => (valuesByEntry.get(entry.id)?.get(field.id) ?? "").split("\n").join(", ")),
    ]),
  ];

  return new NextResponse(encodeCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="time-entries-${identifier}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
