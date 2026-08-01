import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { can } from "@/domain/authorization/authorization-service";
import { parseYearMonth } from "@/domain/calendar/month-grid";
import { buildGanttRows, buildMonthTicks, monthsWindow } from "@/domain/gantt/layout";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { GanttPdfDocument } from "./gantt-pdf-document";

export const dynamic = "force-dynamic";

const MONTHS_SPAN = 3;

// Cookie-authed download endpoint, same pattern as the CSV export — outside /api/v1
// since this serves the gantt page's "PDF" link, not the Bearer/Basic REST API surface.
// Reuses the exact same domain/gantt/layout.ts window/row/tick math as the HTML gantt
// page so the PDF can never drift from what's on screen — only the rendering target
// (React-PDF primitives instead of CSS-positioned divs) differs.
export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year") ?? undefined;
  const monthParam = url.searchParams.get("month") ?? undefined;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { year, month } = parseYearMonth(yearParam, monthParam, new Date());
  const window = monthsWindow(year, month, MONTHS_SPAN);
  const monthTicks = buildMonthTicks(window);

  const [allIssues, trackers] = await Promise.all([new DrizzleIssueRepository().listByProject(project.id), new DrizzleTrackerRepository().listAll()]);
  const visibilityRoles = issuesVisibilityRoles(actor);
  const visibleIssues = allIssues.filter((issue) => isPrivateIssueVisible(issue, user?.id ?? null, visibilityRoles));
  const ganttRows = buildGanttRows(visibleIssues, window);
  const trackerById = new Map(trackers.map((t) => [t.id, t]));

  const rows = ganttRows.map((row) => ({
    label: `${trackerById.get(row.issue.trackerId)?.name ?? "?"} #${row.issue.id.slice(0, 8)} ${row.issue.subject}`,
    depth: row.depth,
    leftPercent: row.leftPercent,
    widthPercent: row.widthPercent,
    doneRatio: row.issue.doneRatio,
  }));

  const buffer = await renderToBuffer(
    <GanttPdfDocument projectName={project.name} windowStart={window.start} windowEnd={window.end} monthTicks={monthTicks} rows={rows} />,
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="gantt-${identifier}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
