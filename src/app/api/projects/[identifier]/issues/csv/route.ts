import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { encodeCsv } from "@/domain/csv/encode";
import { compileFilters } from "@/domain/query/filter-builder";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export const dynamic = "force-dynamic";

// Cookie-authed download endpoint, same pattern as /api/attachments/[id] — outside
// /api/v1 since this serves the HTML issues list's "CSV" link, not the Bearer/Basic
// REST API surface. Mirrors the exact same predicates/visibility filtering as
// projects/[identifier]/issues/page.tsx so the export always matches what's on screen.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status_id");

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const predicates = statusFilter ? compileFilters([{ field: "status_id", operator: "=", values: [statusFilter] }]) : [];

  const [allIssues, statuses, trackers] = await Promise.all([
    new DrizzleIssueRepository().listByProject(project.id, predicates),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
  ]);
  const visibilityRoles = issuesVisibilityRoles(actor);
  const issues = allIssues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, visibilityRoles));
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  const rows = [
    ["#", "トラッカー", "件名", "ステータス", "進捗率"],
    ...issues.map((issue) => [
      issue.id,
      trackerById.get(issue.trackerId)?.name ?? "",
      issue.subject,
      statusById.get(issue.statusId)?.name ?? "",
      String(issue.doneRatio),
    ]),
  ];

  return new NextResponse(encodeCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="issues-${identifier}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
