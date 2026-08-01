"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { logTime, InvalidTimeEntryError } from "@/application/time-entries/log-time";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type LogTimeActionState = {
  error: string | null;
};

const logTimeSchema = z.object({
  issueId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  activityId: z.string().uuid(),
  hours: z.coerce.number(),
  comments: z.string().default(""),
  spentOn: z.string().min(1),
});

export async function logTimeAction(
  _prevState: LogTimeActionState,
  formData: FormData,
): Promise<LogTimeActionState> {
  const parsed = logTimeSchema.safeParse({
    issueId: formData.get("issueId"),
    projectIdentifier: formData.get("projectIdentifier"),
    activityId: formData.get("activityId"),
    hours: formData.get("hours"),
    comments: formData.get("comments") ?? "",
    spentOn: formData.get("spentOn"),
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
  if (!can({ permission: "log_time", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }

  try {
    await logTime(
      { timeEntryRepository: new DrizzleTimeEntryRepository() },
      {
        projectId: project.id,
        issueId: issue.id,
        userId: user.id,
        authorId: user.id,
        activityId: parsed.data.activityId,
        hours: parsed.data.hours,
        comments: parsed.data.comments,
        spentOn: parsed.data.spentOn,
      },
    );
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${parsed.data.issueId}`);
  return { error: null };
}
