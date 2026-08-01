"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { createIssueRelation, InvalidRelationError } from "@/application/issues/create-issue-relation";
import { DrizzleIssueRelationRepository } from "@/infrastructure/db/repositories/issue-relation-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type IssueRelationActionState = {
  error: string | null;
};

const createRelationSchema = z.object({
  projectIdentifier: z.string().min(1),
  issueId: z.string().uuid(),
  targetIssueId: z.string().uuid(),
  relationType: z.enum(["relates", "duplicates", "duplicated", "blocks", "blocked", "precedes", "follows", "copied_to", "copied_from"]),
  delay: z.string().default(""),
});

export async function createIssueRelationAction(
  _prevState: IssueRelationActionState,
  formData: FormData,
): Promise<IssueRelationActionState> {
  const parsed = createRelationSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    issueId: formData.get("issueId"),
    targetIssueId: formData.get("targetIssueId"),
    relationType: formData.get("relationType"),
    delay: formData.get("delay") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const issueRepository = new DrizzleIssueRepository();
  const issue = await issueRepository.findById(parsed.data.issueId);
  if (!issue) {
    return { error: "チケットが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(issue.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  const visibilityRoles = issuesVisibilityRoles(actor);
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, visibilityRoles)) {
    return { error: "チケットが見つかりません。" };
  }
  if (!can({ permission: "manage_issue_relations", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  // The target issue must be independently visible too — otherwise creating a relation
  // to it would both confirm its existence and let the actor manipulate a private issue
  // they can't see.
  const targetIssue = await issueRepository.findById(parsed.data.targetIssueId);
  if (!targetIssue || !isPrivateIssueVisible(targetIssue, user.id, userGroupIds, visibilityRoles)) {
    return { error: "対象のチケットが見つかりません。" };
  }

  const delay = parsed.data.delay.trim().length > 0 ? Number(parsed.data.delay) : null;
  if (delay !== null && !Number.isFinite(delay)) {
    return { error: "遅延日数は数値で入力してください。" };
  }

  try {
    await createIssueRelation(
      { issueRelationRepository: new DrizzleIssueRelationRepository(), issueRepository },
      { issueFromId: issue.id, issueToId: parsed.data.targetIssueId, relationType: parsed.data.relationType, delay },
    );
  } catch (error) {
    if (error instanceof InvalidRelationError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${issue.id}`);
  return { error: null };
}

const deleteRelationSchema = z.object({
  projectIdentifier: z.string().min(1),
  issueId: z.string().uuid(),
  relationId: z.string().uuid(),
});

export async function deleteIssueRelationAction(
  _prevState: IssueRelationActionState,
  formData: FormData,
): Promise<IssueRelationActionState> {
  const parsed = deleteRelationSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    issueId: formData.get("issueId"),
    relationId: formData.get("relationId"),
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

  const issueRelationRepository = new DrizzleIssueRelationRepository();
  const relation = await issueRelationRepository.findById(parsed.data.relationId);
  if (!relation || (relation.issueFromId !== issue.id && relation.issueToId !== issue.id)) {
    return { error: "関連が見つかりません。" };
  }

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }
  if (!can({ permission: "manage_issue_relations", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await issueRelationRepository.delete(relation.id);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${issue.id}`);
  return { error: null };
}
