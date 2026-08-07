"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { filterMembersWithPermission, memberUserIds } from "@/domain/member/entity";
import { addNewsComment, InvalidNewsCommentError } from "@/application/news/add-news-comment";
import { createNews, InvalidNewsError } from "@/application/news/create-news";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleNewsCommentRepository, DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

async function notifiableMemberIds(projectId: string, permission: "view_news") {
  const members = await new DrizzleMemberRepository().listByProject(projectId);
  const rolesById = new Map(
    (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [role.id, role]),
  );
  return memberUserIds(filterMembersWithPermission(members, rolesById, permission));
}

export type CreateNewsActionState = {
  error: string | null;
};

const createNewsSchema = z.object({
  projectIdentifier: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(""),
  description: z.string().min(1),
});

export async function createNewsAction(_prevState: CreateNewsActionState, formData: FormData): Promise<CreateNewsActionState> {
  const parsed = createNewsSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    title: formData.get("title"),
    summary: formData.get("summary") ?? "",
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_news", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  let created;
  try {
    created = await createNews({ newsRepository: new DrizzleNewsRepository() }, {
      projectId: project.id,
      authorId: user.id,
      title: parsed.data.title,
      summary: parsed.data.summary,
      description: parsed.data.description,
    });
  } catch (error) {
    if (error instanceof InvalidNewsError) {
      return { error: error.message };
    }
    throw error;
  }

  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [await notifiableMemberIds(project.id, "view_news")],
      excludeUserId: user.id,
      subject: `[${project.name}] ${created.title}`,
      body: created.description,
    },
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news`);
  redirect(`/projects/${parsed.data.projectIdentifier}/news/${created.id}`);
}

export type DeleteNewsActionState = {
  error: string | null;
};

const deleteNewsSchema = z.object({
  projectIdentifier: z.string().min(1),
  newsId: z.string().uuid(),
});

export async function deleteNewsAction(_prevState: DeleteNewsActionState, formData: FormData): Promise<DeleteNewsActionState> {
  const parsed = deleteNewsSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    newsId: formData.get("newsId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const newsRepository = new DrizzleNewsRepository();
  const item = await newsRepository.findById(parsed.data.newsId);
  if (!item || item.projectId !== project.id) {
    return { error: "お知らせが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_news", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await newsRepository.delete(item.id);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news`);
  redirect(`/projects/${parsed.data.projectIdentifier}/news`);
}

export type AddNewsCommentActionState = {
  error: string | null;
};

const addNewsCommentSchema = z.object({
  projectIdentifier: z.string().min(1),
  newsId: z.string().uuid(),
  content: z.string().min(1),
});

export async function addNewsCommentAction(_prevState: AddNewsCommentActionState, formData: FormData): Promise<AddNewsCommentActionState> {
  const parsed = addNewsCommentSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    newsId: formData.get("newsId"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const newsItem = await new DrizzleNewsRepository().findById(parsed.data.newsId);
  if (!newsItem || newsItem.projectId !== project.id) {
    return { error: "お知らせが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "comment_news", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  let comment;
  try {
    comment = await addNewsComment({ newsCommentRepository: new DrizzleNewsCommentRepository() }, {
      newsId: newsItem.id,
      authorId: user.id,
      content: parsed.data.content,
    });
  } catch (error) {
    if (error instanceof InvalidNewsCommentError) {
      return { error: error.message };
    }
    throw error;
  }

  const watcherUserIds = await new DrizzleWatcherRepository().listWatcherUserIds("News", newsItem.id);
  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [[newsItem.authorId], await notifiableMemberIds(project.id, "view_news"), watcherUserIds],
      excludeUserId: user.id,
      subject: `[${project.name}] ${newsItem.title}`,
      body: comment.content,
    },
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news/${newsItem.id}`);
  return { error: null };
}
