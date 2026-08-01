"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { parseAssigneeValue } from "@/domain/issue/assignee";
import { StaleIssueError } from "@/domain/issue/entity";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { memberUserIds } from "@/domain/member/entity";
import { createIssue } from "@/application/issues/create-issue";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { updateIssue, WorkflowRequiredFieldError, WorkflowTransitionDeniedError } from "@/application/issues/update-issue";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { createIssueFormSchema, type CreateIssueFormValues } from "./issue-schemas";

export async function createIssueFormAction(
  values: CreateIssueFormValues,
): Promise<{ ok: true; issueId: string } | { ok: false; error: string }> {
  const parsed = createIssueFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { ok: false, error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findById(parsed.data.projectId);
  if (!project) {
    return { ok: false, error: "プロジェクトが見つかりません。" };
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "add_issues", project: toAuthorizationProject(project), actor })) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  if (!project.trackerIds.includes(parsed.data.trackerId)) {
    return { ok: false, error: "トラッカーが見つかりません。" };
  }

  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const assignee = parseAssigneeValue(parsed.data.assignedToId);
  if (assignee) {
    const isValidAssignee =
      assignee.type === "user"
        ? members.some((member) => member.userId === assignee.id)
        : members.some((member) => member.groupId === assignee.id);
    if (!isValidAssignee) {
      return { ok: false, error: "担当者が見つかりません。" };
    }
  }

  if (parsed.data.categoryId) {
    const categories = await new DrizzleIssueCategoryRepository().listByProject(project.id);
    if (!categories.some((category) => category.id === parsed.data.categoryId)) {
      return { ok: false, error: "カテゴリが見つかりません。" };
    }
  }

  if (parsed.data.fixedVersionId) {
    // Mirrors Redmine's Issue#validate_fixed_version — a version is assignable if it's
    // shared with (not just owned by) this issue's project, per its sharing setting.
    const sharedVersions = await new DrizzleVersionRepository().listSharedWith(project.id);
    if (!sharedVersions.some((version) => version.id === parsed.data.fixedVersionId)) {
      return { ok: false, error: "バージョンが見つかりません。" };
    }
  }

  if (parsed.data.parentId) {
    const parentIssue = await new DrizzleIssueRepository().findById(parsed.data.parentId);
    if (
      !parentIssue ||
      parentIssue.projectId !== project.id ||
      !isPrivateIssueVisible(parentIssue, user.id, userGroupIds, issuesVisibilityRoles(actor))
    ) {
      return { ok: false, error: "親チケットが見つかりません。" };
    }
  }

  let estimatedHours: number | null = null;
  if (parsed.data.estimatedHours.trim().length > 0) {
    const parsedHours = Number(parsed.data.estimatedHours);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) {
      return { ok: false, error: "予定工数は0以上の数値で入力してください。" };
    }
    estimatedHours = parsedHours;
  }

  let issue;
  try {
    issue = await createIssue(
      {
        issueRepository: new DrizzleIssueRepository(),
        trackerRepository: new DrizzleTrackerRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
      },
      {
        projectId: parsed.data.projectId,
        trackerId: parsed.data.trackerId,
        priorityId: parsed.data.priorityId,
        subject: parsed.data.subject,
        description: parsed.data.description,
        authorId: user.id,
        assignedToId: assignee?.id ?? null,
        assignedToType: assignee?.type ?? null,
        parentId: parsed.data.parentId || null,
        fixedVersionId: parsed.data.fixedVersionId || null,
        categoryId: parsed.data.categoryId || null,
        isPrivate: parsed.data.isPrivate,
        estimatedHours,
        startDate: parsed.data.startDate || null,
        dueDate: parsed.data.dueDate || null,
        actorRoleIds: roleIds,
      },
    );
  } catch (error) {
    if (error instanceof WorkflowRequiredFieldError) {
      return { ok: false, error: "このステータスでは必須項目が未入力です。入力内容を確認してください。" };
    }
    throw error;
  }

  const assigneeUserIds =
    issue.assignedToType === "group" && issue.assignedToId
      ? await new DrizzleGroupRepository().listUserIds(issue.assignedToId)
      : [issue.assignedToId];

  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [[issue.authorId, ...assigneeUserIds], memberUserIds(members)],
      excludeUserId: user.id,
      subject: `[${project.name}] ${issue.subject}`,
      body: issue.description,
    },
  );

  return { ok: true, issueId: issue.id };
}

export type UpdateIssueStatusActionState = {
  error: string | null;
};

const updateIssueStatusSchema = z.object({
  issueId: z.string().uuid(),
  lockVersion: z.coerce.number().int(),
  statusId: z.string().uuid(),
  fixedVersionId: z.string().uuid().or(z.literal("")).default(""),
  notes: z.string().default(""),
});

export async function updateIssueStatusAction(
  _prevState: UpdateIssueStatusActionState,
  formData: FormData,
): Promise<UpdateIssueStatusActionState> {
  const parsed = updateIssueStatusSchema.safeParse({
    issueId: formData.get("issueId"),
    lockVersion: formData.get("lockVersion"),
    statusId: formData.get("statusId"),
    fixedVersionId: formData.get("fixedVersionId") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const issueRepository = new DrizzleIssueRepository();
  const existing = await issueRepository.findById(parsed.data.issueId);
  if (!existing) {
    return { error: "チケットが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(existing.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor, roleIds, userGroupIds } = await resolveActor(user, project.id);
  if (!isPrivateIssueVisible(existing, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }
  const isAuthor = existing.authorId === user.id;
  const isAssignee =
    existing.assignedToType === "group"
      ? existing.assignedToId !== null && userGroupIds.includes(existing.assignedToId)
      : existing.assignedToId === user.id;
  const projectContext = toAuthorizationProject(project);
  const canEditAny = can({ permission: "edit_issues", project: projectContext, actor });
  const canEditOwn = isAuthor && can({ permission: "edit_own_issues", project: projectContext, actor });
  if (!canEditAny && !canEditOwn) {
    return { error: "この操作を行う権限がありません。" };
  }

  let fixedVersionId: string | null = null;
  if (parsed.data.fixedVersionId.length > 0) {
    // Mirrors Redmine's Issue#validate_fixed_version — a version is assignable if it's
    // shared with (not just owned by) this issue's project, per its sharing setting.
    const sharedVersions = await new DrizzleVersionRepository().listSharedWith(project.id);
    if (!sharedVersions.some((version) => version.id === parsed.data.fixedVersionId)) {
      return { error: "バージョンが見つかりません。" };
    }
    fixedVersionId = parsed.data.fixedVersionId;
  }

  try {
    await updateIssue(
      {
        issueRepository,
        journalRepository: new DrizzleJournalRepository(),
        workflowRepository: new DrizzleWorkflowRepository(),
        workflowFieldPermissionRepository: new DrizzleWorkflowFieldPermissionRepository(),
      },
      {
        issueId: parsed.data.issueId,
        expectedLockVersion: parsed.data.lockVersion,
        changes: { statusId: parsed.data.statusId, fixedVersionId },
        notes: parsed.data.notes,
        actingUserId: user.id,
        actorRoleIds: roleIds,
        isAuthor,
        isAssignee,
      },
    );
  } catch (error) {
    if (error instanceof StaleIssueError) {
      return { error: "他の変更と競合しました。ページを再読み込みして再度お試しください。" };
    }
    if (error instanceof WorkflowTransitionDeniedError) {
      return { error: "そのステータスには変更できません。" };
    }
    if (error instanceof WorkflowRequiredFieldError) {
      return { error: "このステータスでは必須項目が未入力のため変更できません。編集画面から入力してください。" };
    }
    throw error;
  }

  revalidatePath(`/projects/${project.identifier}/issues/${parsed.data.issueId}`);
  return { error: null };
}
