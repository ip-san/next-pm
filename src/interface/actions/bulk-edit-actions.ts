"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { IssueUpdate } from "@/domain/issue/repository";
import { updateIssue, WorkflowTransitionDeniedError } from "@/application/issues/update-issue";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type BulkEditActionState = {
  error: string | null;
  message: string | null;
};

const bulkEditSchema = z.object({
  projectIdentifier: z.string().min(1),
  issueIds: z.array(z.string().uuid()).min(1),
  statusId: z.string().default(""),
  priorityId: z.string().default(""),
  assignedToId: z.string().default(""),
  doneRatio: z.string().default(""),
  notes: z.string().default(""),
});

export async function bulkUpdateIssuesAction(
  _prevState: BulkEditActionState,
  formData: FormData,
): Promise<BulkEditActionState> {
  const parsed = bulkEditSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    issueIds: formData.getAll("issueIds"),
    statusId: formData.get("statusId") ?? "",
    priorityId: formData.get("priorityId") ?? "",
    assignedToId: formData.get("assignedToId") ?? "",
    doneRatio: formData.get("doneRatio") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。", message: null };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", message: null };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。", message: null };
  }

  const { actor, roleIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  const canEditAny = can({ permission: "edit_issues", project: projectContext, actor });
  const canEditOwn = can({ permission: "edit_own_issues", project: projectContext, actor });
  if (!canEditAny && !canEditOwn) {
    return { error: "この操作を行う権限がありません。", message: null };
  }

  const changes: IssueUpdate = {};
  if (parsed.data.statusId) changes.statusId = parsed.data.statusId;
  if (parsed.data.priorityId) changes.priorityId = parsed.data.priorityId;
  if (parsed.data.assignedToId) changes.assignedToId = parsed.data.assignedToId === "__none__" ? null : parsed.data.assignedToId;
  if (parsed.data.doneRatio.trim().length > 0) {
    const doneRatio = Number(parsed.data.doneRatio);
    if (!Number.isFinite(doneRatio) || doneRatio < 0 || doneRatio > 100) {
      return { error: "進捗率は0から100の数値で入力してください。", message: null };
    }
    changes.doneRatio = doneRatio;
  }
  if (Object.keys(changes).length === 0 && parsed.data.notes.trim().length === 0) {
    return { error: "変更内容またはコメントを指定してください。", message: null };
  }

  const issueRepository = new DrizzleIssueRepository();
  const journalRepository = new DrizzleJournalRepository();
  const workflowRepository = new DrizzleWorkflowRepository();
  const visibilityRoles = issuesVisibilityRoles(actor);

  let updated = 0;
  let skipped = 0;
  for (const issueId of parsed.data.issueIds) {
    const issue = await issueRepository.findById(issueId);
    // Re-derive everything from the record itself rather than trusting the submitted id —
    // same IDOR-safe pattern as every other mutation in this app.
    if (
      !issue ||
      issue.projectId !== project.id ||
      !isPrivateIssueVisible(issue, user.id, visibilityRoles) ||
      !(canEditAny || (canEditOwn && issue.authorId === user.id))
    ) {
      skipped++;
      continue;
    }

    try {
      await updateIssue(
        { issueRepository, journalRepository, workflowRepository },
        {
          issueId: issue.id,
          expectedLockVersion: issue.lockVersion,
          changes,
          notes: parsed.data.notes,
          actingUserId: user.id,
          actorRoleIds: roleIds,
          isAuthor: issue.authorId === user.id,
          isAssignee: issue.assignedToId === user.id,
        },
      );
      updated++;
    } catch (error) {
      if (error instanceof WorkflowTransitionDeniedError) {
        skipped++;
        continue;
      }
      throw error;
    }
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues`);
  return {
    error: null,
    message: skipped > 0 ? `${updated}件更新しました（${skipped}件はスキップされました）。` : `${updated}件更新しました。`,
  };
}
