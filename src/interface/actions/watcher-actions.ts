"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { toggleWatch } from "@/application/watchers/toggle-watch";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ToggleWatchActionState = {
  error: string | null;
};

const toggleWatchSchema = z.object({
  issueId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
});

export async function toggleIssueWatchAction(_prevState: ToggleWatchActionState, formData: FormData): Promise<ToggleWatchActionState> {
  const parsed = toggleWatchSchema.safeParse({
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

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isPrivateIssueVisible(issue, user.id, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }

  await toggleWatch({ watcherRepository: new DrizzleWatcherRepository() }, "Issue", issue.id, user.id);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${issue.id}`);
  return { error: null };
}
