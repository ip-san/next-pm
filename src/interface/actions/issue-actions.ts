"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { StaleIssueError } from "@/domain/issue/entity";
import { createIssue } from "@/application/issues/create-issue";
import { updateIssue, WorkflowTransitionDeniedError } from "@/application/issues/update-issue";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
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

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "add_issues", project: toAuthorizationProject(project), actor })) {
    return { ok: false, error: "この操作を行う権限がありません。" };
  }

  const issue = await createIssue(
    { issueRepository: new DrizzleIssueRepository(), trackerRepository: new DrizzleTrackerRepository() },
    {
      projectId: parsed.data.projectId,
      trackerId: parsed.data.trackerId,
      priorityId: parsed.data.priorityId,
      subject: parsed.data.subject,
      description: parsed.data.description,
      authorId: user.id,
      assignedToId: null,
      parentId: null,
      categoryId: null,
      isPrivate: false,
      estimatedHours: null,
      startDate: null,
      dueDate: null,
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

  const { actor, roleIds } = await resolveActor(user, project.id);
  const isAuthor = existing.authorId === user.id;
  const isAssignee = existing.assignedToId === user.id;
  const projectContext = toAuthorizationProject(project);
  const canEditAny = can({ permission: "edit_issues", project: projectContext, actor });
  const canEditOwn = isAuthor && can({ permission: "edit_own_issues", project: projectContext, actor });
  if (!canEditAny && !canEditOwn) {
    return { error: "この操作を行う権限がありません。" };
  }

  try {
    await updateIssue(
      {
        issueRepository,
        journalRepository: new DrizzleJournalRepository(),
        workflowRepository: new DrizzleWorkflowRepository(),
      },
      {
        issueId: parsed.data.issueId,
        expectedLockVersion: parsed.data.lockVersion,
        changes: { statusId: parsed.data.statusId },
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
    throw error;
  }

  revalidatePath(`/projects/${project.identifier}/issues/${parsed.data.issueId}`);
  return { error: null };
}
