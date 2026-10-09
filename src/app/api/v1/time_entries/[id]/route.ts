import { restCustomFieldValuesSchema } from "@/interface/http/custom-field-rest-values";
import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { canEditTimeEntry } from "@/domain/time-entry/visibility";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { deleteTimeEntry } from "@/application/time-entries/delete-time-entry";
import {
  setTimeEntryCustomFieldValues,
  validateTimeEntryCustomFieldValues,
} from "@/application/time-entries/set-time-entry-custom-field-values";
import { InvalidTimeEntryError, updateTimeEntry } from "@/application/time-entries/update-time-entry";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import {
  canAccessTimeEntry,
  canAttachIssueToTimeEntry,
  canAttributeTimeEntryTo,
  type TimeEntryAccessContext,
} from "@/interface/http/time-entry-access";
import { verifyCsrf } from "@/interface/http/csrf";
import { localizeMessage } from "@/domain/i18n/error-messages";
import { localeForViewer } from "@/interface/http/locale";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

/**
 * Loads the entry and reproduces TimelogController#find_time_entry through the shared
 * `canAccessTimeEntry` predicate — the same one the list endpoint, the HTML pages and the
 * CSV export apply, so no endpoint is a weaker door to the same row. A not-visible entry
 * raises Unauthorized in Redmine; this API answers 404, because 403 would confirm an entry
 * exists that the requester isn't allowed to know about.
 */
async function loadVisibleEntry(entryId: string, request: Request) {
  const { user, viaCookie } = await resolveUser(request);

  const timeEntryRepository = new DrizzleTimeEntryRepository();
  const entry = await timeEntryRepository.findById(entryId);
  if (!entry) {
    return { ok: false as const, response: notFound() };
  }

  const project = await new DrizzleProjectRepository().findById(entry.projectId);
  if (!project) {
    return { ok: false as const, response: notFound() };
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds, roleIds } = await resolveActor(user, project.id);
  const issue = entry.issueId ? await new DrizzleIssueRepository().findById(entry.issueId) : null;
  const context: TimeEntryAccessContext = {
    userId: user?.id ?? null,
    actor,
    userGroupIds,
    projectContext,
    issueById: new Map(issue ? [[issue.id, issue]] : []),
  };
  if (!canAccessTimeEntry(entry, context)) {
    return { ok: false as const, response: notFound() };
  }

  return { ok: true as const, user, viaCookie, entry, project, projectContext, actor, userGroupIds, roleIds, timeEntryRepository };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadVisibleEntry(id, request);
  if (!loaded.ok) {
    return loaded.response;
  }
  return NextResponse.json({ time_entry: loaded.entry });
}

/** PUT and DELETE share find_time_entry + check_editability; only the body differs. */
async function loadEditableEntry(entryId: string, request: Request) {
  const loaded = await loadVisibleEntry(entryId, request);
  if (!loaded.ok) {
    return loaded;
  }
  if (!loaded.user) {
    return { ok: false as const, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (loaded.viaCookie && !(await verifyCsrf(request))) {
    return { ok: false as const, response: NextResponse.json({ error: "csrf_check_failed" }, { status: 403 }) };
  }
  if (
    !canEditTimeEntry({
      entry: loaded.entry,
      userId: loaded.user.id,
      visible: true,
      canEditTimeEntries: can({ permission: "edit_time_entries", project: loaded.projectContext, actor: loaded.actor }),
      canEditOwnTimeEntries: can({ permission: "edit_own_time_entries", project: loaded.projectContext, actor: loaded.actor }),
    })
  ) {
    return { ok: false as const, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ...loaded, user: loaded.user };
}

const updateTimeEntrySchema = z.object({
  issue_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().optional(),
  activity_id: z.string().uuid().optional(),
  hours: z.number().optional(),
  comments: z.string().optional(),
  spent_on: z.string().optional(),
  custom_field_values: restCustomFieldValuesSchema,
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadEditableEntry(id, request);
  if (!loaded.ok) {
    return loaded.response;
  }
  const { user, entry, projectContext, actor, userGroupIds, roleIds } = loaded;

  const parsed = updateTimeEntrySchema.safeParse((await request.json().catch(() => null))?.time_entry);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  // Attaching the entry to a different issue is authorized separately from editing it:
  // the issue must belong to this project, be visible, and be one the actor could log
  // against (TimeEntry#safe_attributes='s issue branch).
  let issueId = entry.issueId;
  if (parsed.data.issue_id !== undefined && parsed.data.issue_id !== entry.issueId) {
    if (parsed.data.issue_id !== null) {
      const issue = await new DrizzleIssueRepository().findById(parsed.data.issue_id);
      if (!canAttachIssueToTimeEntry(issue, entry.projectId, { userId: user.id, actor, userGroupIds, projectContext })) {
        return NextResponse.json({ error: "invalid_issue_id" }, { status: 422 });
      }
    }
    issueId = parsed.data.issue_id;
  }

  let userId = entry.userId;
  if (parsed.data.user_id !== undefined && parsed.data.user_id !== entry.userId) {
    const assignable = await listAssignableTimeEntryUsers(
      {
        memberRepository: new DrizzleMemberRepository(),
        roleRepository: new DrizzleRoleRepository(),
        userRepository: new DrizzleUserRepository(),
      },
      entry.projectId,
      user,
    );
    const allowed = canAttributeTimeEntryTo({
      changed: true,
      requestedUserId: parsed.data.user_id,
      authorId: entry.authorId,
      assignableUserIds: assignable.map((candidate) => candidate.id),
      canLogTimeForOtherUsers: can({ permission: "log_time_for_other_users", project: projectContext, actor }),
    });
    if (!allowed) {
      return NextResponse.json({ error: "invalid_user_id" }, { status: 422 });
    }
    userId = parsed.data.user_id;
  }

  // Validated before the write, so a rejected value can't leave the other fields applied.
  // Partial semantics on PUT: only the keys actually sent are checked.
  const customFieldErrors = await validateTimeEntryCustomFieldValues(
    new DrizzleCustomFieldRepository(),
    parsed.data.custom_field_values,
    { full: false },
customFieldViewerFor(user, roleIds),
);
  if (Object.keys(customFieldErrors).length > 0) {
    return NextResponse.json({ error: "invalid_custom_field_values", details: customFieldErrors }, { status: 422 });
  }

  try {
    const updated = await updateTimeEntry(
      {
        timeEntryRepository: loaded.timeEntryRepository,
        settingsRepository: new DrizzleSettingsRepository(),
        enumerationRepository: new DrizzleEnumerationRepository(),
        projectActivityRepository: new DrizzleProjectActivityRepository(),
        issueRepository: new DrizzleIssueRepository(),
      },
      entry,
      {
        issueId,
        userId,
        activityId: parsed.data.activity_id,
        hours: parsed.data.hours,
        comments: parsed.data.comments,
        spentOn: parsed.data.spent_on,
      },
    );

    if (Object.keys(parsed.data.custom_field_values).length > 0) {
      await setTimeEntryCustomFieldValues(
        { customFieldRepository: new DrizzleCustomFieldRepository(), customValueRepository: new DrizzleCustomValueRepository() },
        updated.id,
        parsed.data.custom_field_values,
customFieldViewerFor(user, roleIds),
);
    }

    return NextResponse.json({ time_entry: updated });
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) {
      return NextResponse.json({ error: localizeMessage(await localeForViewer(user), error.message) }, { status: 422 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadEditableEntry(id, request);
  if (!loaded.ok) {
    return loaded.response;
  }

  await deleteTimeEntry(
    { timeEntryRepository: loaded.timeEntryRepository, customValueRepository: new DrizzleCustomValueRepository() },
    loaded.entry.id,
  );
  return new NextResponse(null, { status: 204 });
}
