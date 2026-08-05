"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { toggleWatch } from "@/application/watchers/toggle-watch";
import { DrizzleBoardRepository } from "@/infrastructure/db/repositories/board-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleMessageRepository } from "@/infrastructure/db/repositories/message-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
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

  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }

  await toggleWatch({ watcherRepository: new DrizzleWatcherRepository() }, "Issue", issue.id, user.id);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${issue.id}`);
  return { error: null };
}

export type WatcherActionState = {
  error: string | null;
};

const addWatcherSchema = z.object({
  issueId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  userId: z.string().uuid(),
});

// Mirrors Redmine's WatchersController#create: the actor needs add_issue_watchers, and the
// target must be Principal.assignable_watchers — a project member, not an arbitrary user id.
export async function addIssueWatcherAction(_prevState: WatcherActionState, formData: FormData): Promise<WatcherActionState> {
  const parsed = addWatcherSchema.safeParse({
    issueId: formData.get("issueId"),
    projectIdentifier: formData.get("projectIdentifier"),
    userId: formData.get("userId"),
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
  if (!can({ permission: "add_issue_watchers", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }

  const targetMember = await new DrizzleMemberRepository().findByUserAndProject(parsed.data.userId, project.id);
  if (!targetMember) {
    return { error: "指定されたユーザーはこのプロジェクトのメンバーではありません。" };
  }

  await new DrizzleWatcherRepository().watch("Issue", issue.id, parsed.data.userId);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${issue.id}`);
  return { error: null };
}

const removeWatcherSchema = z.object({
  issueId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  userId: z.string().uuid(),
});

export async function removeIssueWatcherAction(_prevState: WatcherActionState, formData: FormData): Promise<WatcherActionState> {
  const parsed = removeWatcherSchema.safeParse({
    issueId: formData.get("issueId"),
    projectIdentifier: formData.get("projectIdentifier"),
    userId: formData.get("userId"),
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
  if (!can({ permission: "delete_issue_watchers", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isPrivateIssueVisible(issue, user.id, userGroupIds, issuesVisibilityRoles(actor))) {
    return { error: "チケットが見つかりません。" };
  }

  await new DrizzleWatcherRepository().unwatch("Issue", issue.id, parsed.data.userId);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues/${issue.id}`);
  return { error: null };
}

const toggleNewsWatchSchema = z.object({
  newsId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
});

// Mirrors Redmine's News/Message/Wiki::Page acts_as_watchable: watching a viewable object needs
// no separate permission beyond the module's own view_* — same reasoning as toggleIssueWatchAction.
export async function toggleNewsWatchAction(_prevState: ToggleWatchActionState, formData: FormData): Promise<ToggleWatchActionState> {
  const parsed = toggleNewsWatchSchema.safeParse({
    newsId: formData.get("newsId"),
    projectIdentifier: formData.get("projectIdentifier"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const item = await new DrizzleNewsRepository().findById(parsed.data.newsId);
  if (!item) {
    return { error: "ニュースが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(item.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_news", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await toggleWatch({ watcherRepository: new DrizzleWatcherRepository() }, "News", item.id, user.id);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news/${item.id}`);
  return { error: null };
}

const toggleMessageWatchSchema = z.object({
  messageId: z.string().uuid(),
  boardId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
});

export async function toggleMessageWatchAction(_prevState: ToggleWatchActionState, formData: FormData): Promise<ToggleWatchActionState> {
  const parsed = toggleMessageWatchSchema.safeParse({
    messageId: formData.get("messageId"),
    boardId: formData.get("boardId"),
    projectIdentifier: formData.get("projectIdentifier"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const topic = await new DrizzleMessageRepository().findById(parsed.data.messageId);
  if (!topic || topic.boardId !== parsed.data.boardId) {
    return { error: "トピックが見つかりません。" };
  }

  const board = await new DrizzleBoardRepository().findById(topic.boardId);
  if (!board) {
    return { error: "フォーラムが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(board.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_messages", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await toggleWatch({ watcherRepository: new DrizzleWatcherRepository() }, "Message", topic.id, user.id);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/boards/${board.id}/messages/${topic.id}`);
  return { error: null };
}

const toggleWikiPageWatchSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().min(1),
  projectIdentifier: z.string().min(1),
});

export async function toggleWikiPageWatchAction(_prevState: ToggleWatchActionState, formData: FormData): Promise<ToggleWatchActionState> {
  const parsed = toggleWikiPageWatchSchema.safeParse({
    pageId: formData.get("pageId"),
    title: formData.get("title"),
    projectIdentifier: formData.get("projectIdentifier"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const page = await new DrizzleWikiPageRepository().findById(parsed.data.pageId);
  if (!page) {
    return { error: "Wikiページが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(page.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await toggleWatch({ watcherRepository: new DrizzleWatcherRepository() }, "WikiPage", page.id, user.id);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/wiki/${encodeURIComponent(parsed.data.title)}`);
  return { error: null };
}
