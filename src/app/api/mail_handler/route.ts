import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { extractIssueReplyIdPrefix, parseEmail, UnsupportedMailFormatError } from "@/domain/mail/parse-email";
import type { User } from "@/domain/user/entity";
import { createIssue } from "@/application/issues/create-issue";
import { updateIssue, WorkflowRequiredFieldError } from "@/application/issues/update-issue";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

const requestSchema = z.object({
  key: z.string(),
  email: z.string(),
  project: z.string().optional(),
});

/**
 * Constant-time key check — this endpoint has no session/API-key user auth of its own (mirrors
 * Redmine's mail_handler route, gated only by a shared secret compared with secure_compare).
 * An unset MAIL_HANDLER_API_KEY means the feature is disabled, never an always-accept key.
 */
function keyMatches(provided: string): boolean {
  const expected = process.env.MAIL_HANDLER_API_KEY;
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Mirrors Redmine's MailHandlerController + MailHandler#dispatch, scoped down to what's
// verifiable without a real mail server or a MIME test corpus: single-part text/plain messages
// only (see domain/mail/parse-email.ts for exactly what's rejected), and two dispatch paths —
// reply-to-an-existing-issue (via a "[... #eb0b2d1a]" subject, next-pm's id-prefix shorthand in
// place of Redmine's sequential issue number) or create-a-new-issue in an explicitly named
// project. NOT covered, same as real Redmine's fuller feature: attachments, watchers from
// To/Cc, keyword-extracted fields (Status:/Priority:/etc.), unknown-sender account creation,
// project-from-subaddress routing, replies to wiki/news/message/forum content.
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  }

  if (!keyMatches(parsed.data.key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let parsedEmail;
  try {
    parsedEmail = parseEmail(parsed.data.email);
  } catch (error) {
    if (error instanceof UnsupportedMailFormatError) {
      return NextResponse.json({ error: "unsupported_mail_format", message: error.message }, { status: 422 });
    }
    throw error;
  }

  const sender = await new DrizzleUserRepository().findByMail(parsedEmail.fromEmail);
  if (!sender || sender.status !== "active") {
    // Matches Redmine's own default: emails from unknown or inactive senders are silently
    // ignored, not an error — this is the expected outcome for e.g. spam or bounce traffic.
    return NextResponse.json({ result: "ignored", reason: "unknown_or_inactive_sender" }, { status: 200 });
  }

  const replyPrefix = extractIssueReplyIdPrefix(parsedEmail.subject);
  if (replyPrefix) {
    return handleReply(sender, replyPrefix, parsedEmail.body);
  }

  if (!parsed.data.project) {
    return NextResponse.json({ error: "missing_project" }, { status: 422 });
  }
  return handleCreate(sender, parsed.data.project, parsedEmail.subject, parsedEmail.body);
}

async function handleReply(sender: User, issueIdPrefix: string, body: string) {
  const issueRepository = new DrizzleIssueRepository();
  const candidates = await issueRepository.findByIdPrefix(issueIdPrefix);
  if (candidates.length !== 1) {
    return NextResponse.json({ result: "ignored", reason: "no_matching_issue" }, { status: 200 });
  }
  const existing = candidates[0];

  const project = await new DrizzleProjectRepository().findById(existing.projectId);
  if (!project) {
    return NextResponse.json({ result: "ignored", reason: "no_matching_issue" }, { status: 200 });
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(sender, project.id);
  if (!isPrivateIssueVisible(existing, sender.id, userGroupIds, issuesVisibilityRoles(actor))) {
    // Same "don't confirm existence" rule as everywhere else a private issue might be reached.
    return NextResponse.json({ result: "ignored", reason: "no_matching_issue" }, { status: 200 });
  }
  const projectContext = toAuthorizationProject(project);
  const isAuthor = existing.authorId === sender.id;
  const canEditAny = can({ permission: "edit_issues", project: projectContext, actor });
  const canEditOwn = isAuthor && can({ permission: "edit_own_issues", project: projectContext, actor });
  if (!canEditAny && !canEditOwn) {
    return NextResponse.json({ result: "ignored", reason: "insufficient_permissions" }, { status: 200 });
  }

  const isAssignee =
    existing.assignedToType === "group"
      ? existing.assignedToId !== null && userGroupIds.includes(existing.assignedToId)
      : existing.assignedToId === sender.id;

  try {
    const issue = await updateIssue(
      {
        issueRepository,
        journalRepository: new DrizzleJournalRepository(),
        workflowRepository: new DrizzleWorkflowRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
      },
      {
        issueId: existing.id,
        expectedLockVersion: existing.lockVersion,
        notes: body,
        actingUserId: sender.id,
        actorRoleIds: roleIds,
        isAuthor,
        isAssignee,
        changes: {},
      },
    );
    return NextResponse.json({ result: "note_added", issue }, { status: 201 });
  } catch (error) {
    if (error instanceof WorkflowRequiredFieldError) {
      return NextResponse.json({ result: "ignored", reason: "workflow_required_field" }, { status: 200 });
    }
    throw error;
  }
}

async function handleCreate(sender: User, projectIdentifier: string, subject: string, body: string) {
  const project = await new DrizzleProjectRepository().findByIdentifier(projectIdentifier);
  if (!project) {
    return NextResponse.json({ error: "unknown_project" }, { status: 422 });
  }

  const { actor, roleIds } = await resolveActor(sender, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "add_issues", project: projectContext, actor })) {
    return NextResponse.json({ result: "ignored", reason: "insufficient_permissions" }, { status: 200 });
  }

  const trackerId = project.trackerIds[0];
  if (!trackerId) {
    return NextResponse.json({ error: "no_tracker_available" }, { status: 422 });
  }
  const priorities = await new DrizzleEnumerationRepository().listByType("IssuePriority");
  const priority = priorities.find((p) => p.isDefault) ?? priorities[0];
  if (!priority) {
    return NextResponse.json({ error: "no_priority_available" }, { status: 422 });
  }

  // Mail never supplies custom field values (keyword extraction is out of scope for this
  // pass — see the module doc comment), but a required custom field with nothing to fill it
  // still must block creation, exactly as it would in real Redmine (Issue#save! raising
  // RecordInvalid, rescued and logged as a silent failure at the dispatch level) and in this
  // app's own REST API (POST /api/v1/issues).
  const applicableFields = await new DrizzleCustomFieldRepository().listForTracker(trackerId);
  const { fieldErrors } = validateCustomFieldValues(
    applicableFields,
    Object.fromEntries(applicableFields.map((field) => [field.id, ""])),
  );
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ result: "ignored", reason: "required_custom_field_missing" }, { status: 200 });
  }

  const trimmedSubject = subject.trim().slice(0, 255);
  try {
    const issue = await createIssue(
      {
        issueRepository: new DrizzleIssueRepository(),
        trackerRepository: new DrizzleTrackerRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
      },
      {
        projectId: project.id,
        trackerId,
        priorityId: priority.id,
        subject: trimmedSubject.length > 0 ? trimmedSubject : "(no subject)",
        description: body,
        authorId: sender.id,
        assignedToId: null,
        assignedToType: null,
        parentId: null,
        fixedVersionId: null,
        categoryId: null,
        isPrivate: false,
        estimatedHours: null,
        startDate: null,
        dueDate: null,
        actorRoleIds: roleIds,
      },
    );
    return NextResponse.json({ result: "issue_created", issue }, { status: 201 });
  } catch (error) {
    if (error instanceof WorkflowRequiredFieldError) {
      return NextResponse.json({ result: "ignored", reason: "workflow_required_field" }, { status: 200 });
    }
    throw error;
  }
}
