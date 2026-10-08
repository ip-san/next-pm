"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { toggleReaction } from "@/application/reactions/toggle-reaction";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleReactionRepository } from "@/infrastructure/db/repositories/reaction-repository";
import { isJournalVisible } from "@/domain/journal/visibility";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, journalViewerFor, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ToggleReactionActionState = {
  error: string | null;
};

const toggleJournalReactionSchema = z.object({
  journalId: z.string().uuid(),
});

// The journal's own issue is the only source of truth for what's being authorized — issueId
// is never taken from the client, since a form field just claiming "this journal belongs to
// an issue you can see" would let a reaction be forged onto a journal on a completely
// different (possibly private, possibly inaccessible) issue.
export async function toggleJournalReactionAction(
  _prevState: ToggleReactionActionState,
  formData: FormData,
): Promise<ToggleReactionActionState> {
  const parsed = toggleJournalReactionSchema.safeParse({
    journalId: formData.get("journalId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  // Locating the journal has to come before the project is known, and the project is what
  // decides whether this viewer may read a private note — so this first read is deliberately
  // unfiltered and its result is used only to find the issue. Visibility is applied below,
  // once the actor is resolved, and before anything is written.
  const journalRepository = new DrizzleJournalRepository();
  const journal = await journalRepository.findById(parsed.data.journalId, { userId: user.id, canViewPrivateNotes: true });
  if (!journal) {
    return { error: "コメントが見つかりません。" };
  }

  const issue = await new DrizzleIssueRepository().findById(journal.journalizedId);
  if (!issue) {
    return { error: "チケットが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  // Without this, reacting would be an oracle for whether a private note exists.
  if (!isJournalVisible(journal, journalViewerFor(user.id, actor, project))) {
    return { error: "コメントが見つかりません。" };
  }
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }

  await toggleReaction({ reactionRepository: new DrizzleReactionRepository() }, "Journal", journal.id, user.id);

  revalidatePath(`/projects/${project.identifier}/issues/${issue.id}`);
  return { error: null };
}
