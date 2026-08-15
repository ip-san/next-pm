"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { toggleReaction } from "@/application/reactions/toggle-reaction";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleReactionRepository } from "@/infrastructure/db/repositories/reaction-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ToggleReactionActionState = {
  error: string | null;
};

const toggleJournalReactionSchema = z.object({
  journalId: z.string().uuid(),
  issueId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
});

export async function toggleJournalReactionAction(
  _prevState: ToggleReactionActionState,
  formData: FormData,
): Promise<ToggleReactionActionState> {
  const parsed = toggleJournalReactionSchema.safeParse({
    journalId: formData.get("journalId"),
    issueId: formData.get("issueId"),
    projectIdentifier: formData.get("projectIdentifier"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const issue = await new DrizzleIssueRepository().findById(parsed.data.issueId);
  if (!issue) {
    return { error: "チケットが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }

  await toggleReaction({ reactionRepository: new DrizzleReactionRepository() }, "Journal", parsed.data.journalId, user.id);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${parsed.data.issueId}`);
  return { error: null };
}
