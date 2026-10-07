"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { JournalNotEditableError, updateJournal } from "@/application/journals/update-journal";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { journalViewerFor, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

const updateJournalSchema = z.object({
  journalId: z.string().uuid(),
  notes: z.string(),
  privateNotes: z.boolean(),
});

export type UpdateJournalActionResult = { ok: true; deleted: boolean } | { ok: false; error: string };

/**
 * Redmine's JournalsController#update. The issue and project are resolved from the journal
 * itself, never from anything the caller sends, so there is no id to swap.
 */
export async function updateJournalAction(values: {
  journalId: string;
  notes: string;
  privateNotes: boolean;
}): Promise<UpdateJournalActionResult> {
  const parsed = updateJournalSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { ok: false, error: "ログインしてください。" };
  }

  const journalRepository = new DrizzleJournalRepository();
  // Unfiltered only to locate the issue — the use case re-checks visibility against the
  // real viewer before it edits anything, the same pattern the reaction action uses.
  const located = await journalRepository.findById(parsed.data.journalId, { userId: user.id, canViewPrivateNotes: true });
  if (!located) {
    return { ok: false, error: "コメントが見つかりません。" };
  }
  const issue = await new DrizzleIssueRepository().findById(located.journalizedId);
  const project = issue ? await new DrizzleProjectRepository().findById(issue.projectId) : null;
  if (!issue || !project) {
    return { ok: false, error: "コメントが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return { ok: false, error: "コメントが見つかりません。" };
  }

  let result;
  try {
    result = await updateJournal(
      { journalRepository, issueRepository: new DrizzleIssueRepository(), projectRepository: new DrizzleProjectRepository() },
      {
        journalId: parsed.data.journalId,
        notes: parsed.data.notes,
        privateNotes: parsed.data.privateNotes,
        actingUserId: user.id,
        actor,
        viewer: journalViewerFor(user.id, actor, project),
      },
    );
  } catch (error) {
    if (error instanceof JournalNotEditableError) {
      return { ok: false, error: "このコメントを編集する権限がありません。" };
    }
    throw error;
  }

  revalidatePath(`/projects/${project.identifier}/issues/${issue.id}`);
  return { ok: true, deleted: result.deleted };
}
