import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { canEditTimeEntry, isTimeEntryVisible } from "@/domain/time-entry/visibility";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { deleteTimeEntry } from "@/application/time-entries/delete-time-entry";
import { setTimeEntryCustomFieldValues } from "@/application/time-entries/set-time-entry-custom-field-values";
import { InvalidTimeEntryError, updateTimeEntry } from "@/application/time-entries/update-time-entry";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromAuthorizationHeader, currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { timeEntriesVisibilityRoles } from "@/interface/http/time-entry-access";
import { verifyCsrf } from "@/interface/http/csrf";

async function resolveUser(request: Request) {
  const viaApiKey = await currentUserFromAuthorizationHeader(request);
  if (viaApiKey) return { user: viaApiKey, viaCookie: false };
  const viaCookie = await currentUserFromCookies();
  return { user: viaCookie, viaCookie: true };
}

/**
 * Loads the entry and reproduces TimelogController#find_time_entry: a not-visible entry
 * raises Unauthorized there, but this API answers 404 for it, because 403 would confirm
 * an entry exists that the requester isn't allowed to know about.
 */
async function loadVisibleEntry(entryId: string, request: Request) {
  const { user, viaCookie } = await resolveUser(request);

  const timeEntryRepository = new DrizzleTimeEntryRepository();
  const entry = await timeEntryRepository.findById(entryId);
  if (!entry) {
    return { ok: false as const, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }

  const project = await new DrizzleProjectRepository().findById(entry.projectId);
  if (!project) {
    return { ok: false as const, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (
    !can({ permission: "view_time_entries", project: projectContext, actor }) ||
    !isTimeEntryVisible(entry, user?.id ?? null, timeEntriesVisibilityRoles(actor))
  ) {
    return { ok: false as const, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }

  // Same leak rule as the list endpoint: an entry booked against a private issue the
  // requester can't see must look like it isn't there.
  if (entry.issueId) {
    const issue = await new DrizzleIssueRepository().findById(entry.issueId);
    if (issue && !isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, issuesVisibilityRoles(actor))) {
      return { ok: false as const, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
    }
  }

  return { ok: true as const, user, viaCookie, entry, project, projectContext, actor, timeEntryRepository };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadVisibleEntry(id, request);
  if (!loaded.ok) {
    return loaded.response;
  }
  return NextResponse.json({ time_entry: loaded.entry });
}

const updateTimeEntrySchema = z.object({
  issue_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().optional(),
  activity_id: z.string().uuid().optional(),
  hours: z.number().optional(),
  comments: z.string().optional(),
  spent_on: z.string().optional(),
  custom_field_values: z.record(z.string(), z.string()).default({}),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadVisibleEntry(id, request);
  if (!loaded.ok) {
    return loaded.response;
  }
  const { user, viaCookie, entry, projectContext, actor } = loaded;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  if (
    !canEditTimeEntry({
      entry,
      userId: user.id,
      visible: true,
      canEditTimeEntries: can({ permission: "edit_time_entries", project: projectContext, actor }),
      canEditOwnTimeEntries: can({ permission: "edit_own_time_entries", project: projectContext, actor }),
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = updateTimeEntrySchema.safeParse((await request.json().catch(() => null))?.time_entry);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.issues }, { status: 422 });
  }

  // Reattributing an entry needs log_time_for_other_users AND a target in assignable_users
  // — same pair of checks TimeEntry#safe_attributes=/validate_time_entry runs.
  if (parsed.data.user_id !== undefined && parsed.data.user_id !== entry.userId) {
    if (!can({ permission: "log_time_for_other_users", project: projectContext, actor })) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const assignable = await listAssignableTimeEntryUsers(
      {
        memberRepository: new DrizzleMemberRepository(),
        roleRepository: new DrizzleRoleRepository(),
        userRepository: new DrizzleUserRepository(),
      },
      entry.projectId,
      user,
    );
    if (!assignable.some((candidate) => candidate.id === parsed.data.user_id)) {
      return NextResponse.json({ error: "invalid_user_id" }, { status: 422 });
    }
  }

  try {
    const updated = await updateTimeEntry(
      {
        timeEntryRepository: loaded.timeEntryRepository,
        settingsRepository: new DrizzleSettingsRepository(),
        issueRepository: new DrizzleIssueRepository(),
      },
      entry,
      {
        issueId: parsed.data.issue_id,
        userId: parsed.data.user_id,
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
          updated.id,
          parsed.data.custom_field_values,
        );
      } catch (customFieldError) {
        if (customFieldError instanceof CustomFieldValidationError) {
          return NextResponse.json(
            { time_entry: updated, error: "invalid_custom_field_values", details: customFieldError.fieldErrors },
            { status: 422 },
          );
        }
        throw customFieldError;
      }
    }

    return NextResponse.json({ time_entry: updated });
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadVisibleEntry(id, request);
  if (!loaded.ok) {
    return loaded.response;
  }
  const { user, viaCookie, entry, projectContext, actor } = loaded;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viaCookie && !(await verifyCsrf(request))) {
    return NextResponse.json({ error: "csrf_check_failed" }, { status: 403 });
  }

  // Redmine's destroy goes through the same editable_by? gate as edit.
  if (
    !canEditTimeEntry({
      entry,
      userId: user.id,
      visible: true,
      canEditTimeEntries: can({ permission: "edit_time_entries", project: projectContext, actor }),
      canEditOwnTimeEntries: can({ permission: "edit_own_time_entries", project: projectContext, actor }),
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await deleteTimeEntry(
    { timeEntryRepository: loaded.timeEntryRepository, customValueRepository: new DrizzleCustomValueRepository() },
    entry.id,
  );
  return new NextResponse(null, { status: 204 });
}
