import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { InvalidTimeEntryError, logTime } from "@/application/time-entries/log-time";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

// Mirrors projects/[identifier]/time-entries/page.tsx's exact filtering: an entry logged
// against a private issue the requester can't see must not leak that issue's existence.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  const issueId = url.searchParams.get("issue_id");
  if (!projectId && !issueId) {
    return NextResponse.json({ error: "project_id or issue_id is required" }, { status: 400 });
  }

  const { user } = await resolveUser(request);
  const issueRepository = new DrizzleIssueRepository();

  let resolvedProjectId = projectId;
  if (issueId) {
    const issue = await issueRepository.findById(issueId);
    if (!issue) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    resolvedProjectId = issue.projectId;
  }

  const project = await new DrizzleProjectRepository().findById(resolvedProjectId!);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_time_entries", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const timeEntryRepository = new DrizzleTimeEntryRepository();
  const allEntries = issueId
    ? (await timeEntryRepository.listForIssue(issueId))
    : await timeEntryRepository.listForProject(project.id);

  const issueIds = [...new Set(allEntries.map((e) => e.issueId).filter((id): id is string => id !== null))];
  const issues = await Promise.all(issueIds.map((id) => issueRepository.findById(id)));
  const issueById = new Map(issues.filter((i) => i !== null).map((i) => [i.id, i]));
  const visibilityRoles = issuesVisibilityRoles(actor);
  const entries = allEntries.filter((entry) => {
    if (!entry.issueId) return true;
    const issue = issueById.get(entry.issueId);
    return !issue || isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, visibilityRoles);
  });

  return NextResponse.json({ time_entries: entries });
}

const createTimeEntrySchema = z.object({
  issue_id: z.string().uuid().nullable().default(null),
  project_id: z.string().uuid().nullable().default(null),
  activity_id: z.string().uuid(),
  hours: z.number(),
  comments: z.string().default(""),
  spent_on: z.string(),
});

export async function POST(request: Request) {
  const { user, viaCookie } = await resolveUser(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  const parsed = createTimeEntrySchema.safeParse((await request.json().catch(() => null))?.time_entry);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }
  if (!parsed.data.issue_id && !parsed.data.project_id) {
    return NextResponse.json({ error: "issue_id or project_id is required" }, { status: 422 });
  }

  // Never trust a client-supplied project_id when issue_id is also given — always re-derive
  // the true owning project from the issue record itself, same IDOR-safe pattern used
  // everywhere else in this app.
  let projectId = parsed.data.project_id;
  let issueId = parsed.data.issue_id;
  let issue = null;
  if (issueId) {
    issue = await new DrizzleIssueRepository().findById(issueId);
    if (!issue) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    projectId = issue.projectId;
  } else {
    issueId = null;
  }

  const project = await new DrizzleProjectRepository().findById(projectId!);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  // Checked before the permission gate, and returns the same not_found a nonexistent
  // issue would — logging time against an issue implicitly confirms it exists, so a
  // private issue the actor can't see must look identical to one that isn't there.
  if (issue && !isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!can({ permission: "log_time", project: toAuthorizationProject(project), actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const entry = await logTime(
      { timeEntryRepository: new DrizzleTimeEntryRepository() },
      {
        projectId: project.id,
        issueId,
        userId: user.id,
        authorId: user.id,
        activityId: parsed.data.activity_id,
        hours: parsed.data.hours,
        comments: parsed.data.comments,
        spentOn: parsed.data.spent_on,
      },
    );
    return NextResponse.json({ time_entry: entry }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
