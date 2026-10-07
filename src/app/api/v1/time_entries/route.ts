import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { InvalidTimeEntryError, logTime } from "@/application/time-entries/log-time";
import { setTimeEntryCustomFieldValues } from "@/application/time-entries/set-time-entry-custom-field-values";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { canAttachIssueToTimeEntry, canAttributeTimeEntryTo, filterAccessibleTimeEntries } from "@/interface/http/time-entry-access";
import { verifyCsrf } from "@/interface/http/csrf";
import { paginate, parsePagination } from "@/interface/http/pagination";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

// Rows go through `canAccessTimeEntry`, exactly as the HTML list, the report, the CSV
// export and the single-entry endpoint do, and the envelope's total_count is computed over
// that filtered set — never over the raw query — so the count can't be used to infer how
// many entries were withheld.
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

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  const permitted = can({ permission: "view_time_entries", project: projectContext, actor });
  if (issueId) {
    // Scoped by issue: the answer must not distinguish "this issue exists but is in a
    // project you can't read" (or "is private and not yours") from "no such issue", or the
    // endpoint becomes an existence oracle for issue ids across every project.
    const issue = await issueRepository.findById(issueId);
    const visible = issue !== null && isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, issuesVisibilityRoles(actor));
    if (!permitted || !visible) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  } else if (!permitted) {
    // Scoped by project: the caller supplied the project id, so 403 adds nothing they
    // didn't already have — and it matches every other project-scoped endpoint here.
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const timeEntryRepository = new DrizzleTimeEntryRepository();
  const allEntries = issueId
    ? (await timeEntryRepository.listForIssue(issueId))
    : await timeEntryRepository.listForProject(project.id);

  const issueIds = [...new Set(allEntries.map((e) => e.issueId).filter((id): id is string => id !== null))];
  const issues = await Promise.all(issueIds.map((id) => issueRepository.findById(id)));
  const issueById = new Map(issues.filter((i) => i !== null).map((i) => [i.id, i]));
  const visibleEntries = filterAccessibleTimeEntries(allEntries, {
    userId: user?.id ?? null,
    actor,
    userGroupIds,
    projectContext,
    issueById,
  });

  const { items: time_entries, total_count, offset, limit } = paginate(visibleEntries, parsePagination(url));
  return NextResponse.json({ time_entries, total_count, offset, limit });
}

const createTimeEntrySchema = z.object({
  issue_id: z.string().uuid().nullable().default(null),
  project_id: z.string().uuid().nullable().default(null),
  user_id: z.string().uuid().nullable().default(null),
  activity_id: z.string().uuid(),
  hours: z.number(),
  comments: z.string().default(""),
  spent_on: z.string(),
  custom_field_values: z.record(z.string(), z.string()).default({}),
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

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "log_time", project: projectContext, actor })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // The issue check returns the same not_found a nonexistent issue would — logging time
  // against an issue implicitly confirms it exists, so a private issue the actor can't see
  // must look identical to one that isn't there.
  if (issue && !canAttachIssueToTimeEntry(issue, project.id, { userId: user.id, actor, userGroupIds, projectContext })) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Attributing the entry to someone else needs log_time_for_other_users AND a target in
  // assignable_users — holding the permission is not a licence to log time against an
  // arbitrary account (TimeEntry#safe_attributes= + validate_time_entry).
  let userId = user.id;
  if (parsed.data.user_id && parsed.data.user_id !== user.id) {
    const assignable = await listAssignableTimeEntryUsers(
      {
        memberRepository: new DrizzleMemberRepository(),
        roleRepository: new DrizzleRoleRepository(),
        userRepository: new DrizzleUserRepository(),
      },
      project.id,
      user,
    );
    const allowed = canAttributeTimeEntryTo({
      changed: true,
      requestedUserId: parsed.data.user_id,
      // The entry is being created by this actor, so they are its author.
      authorId: user.id,
      assignableUserIds: assignable.map((candidate) => candidate.id),
      canLogTimeForOtherUsers: can({ permission: "log_time_for_other_users", project: projectContext, actor }),
    });
    if (!allowed) {
      return NextResponse.json({ error: "invalid_user_id" }, { status: 422 });
    }
    userId = parsed.data.user_id;
  }

  try {
    const entry = await logTime(
      {
        timeEntryRepository: new DrizzleTimeEntryRepository(),
        settingsRepository: new DrizzleSettingsRepository(),
        enumerationRepository: new DrizzleEnumerationRepository(),
      },
      {
        projectId: project.id,
        issueId,
        userId,
        authorId: user.id,
        activityId: parsed.data.activity_id,
        hours: parsed.data.hours,
        comments: parsed.data.comments,
        spentOn: parsed.data.spent_on,
      },
    );

    if (Object.keys(parsed.data.custom_field_values).length > 0) {
      try {
        await setTimeEntryCustomFieldValues(
          { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
          entry.id,
          parsed.data.custom_field_values,
        );
      } catch (customFieldError) {
        if (customFieldError instanceof CustomFieldValidationError) {
          return NextResponse.json(
            { time_entry: entry, error: "invalid_custom_field_values", details: customFieldError.fieldErrors },
            { status: 422 },
          );
        }
        throw customFieldError;
      }
    }

    return NextResponse.json({ time_entry: entry }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
