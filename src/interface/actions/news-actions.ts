"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { can } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import type { User } from "@/domain/user/entity";
import { filterMembersWithPermission, memberUserIds } from "@/domain/member/entity";
import { addNewsComment, InvalidNewsCommentError } from "@/application/news/add-news-comment";
import { uploadAttachment } from "@/application/attachments/upload-attachment";
import { createNews } from "@/application/news/create-news";
import { deleteNews } from "@/application/news/delete-news";
import { updateNews } from "@/application/news/update-news";
import { InvalidNewsError } from "@/domain/news/validate";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { triggerNewsWebhook } from "@/interface/http/webhook-trigger";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleNewsCommentRepository, DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
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
  await triggerNewsWebhook(project, created);

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

  await deleteNews(
    { newsRepository, attachmentRepository: new DrizzleAttachmentRepository(), attachmentStorage: new FsAttachmentStore() },
    item.id,
  );
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

export type NewsMutationActionState = {
  error: string | null;
};

/**
 * `manage_news` covers news#edit/#update/#destroy *and* comments#destroy in Redmine's
 * preparation.rb, plus the attachment permissions News declares
 * (`acts_as_attachable :edit_permission => :manage_news, :delete_permission => :manage_news`).
 * There is no "own news" or "own comment" rule anywhere, so one gate serves them all.
 */
async function authorizeManageNews(
  projectIdentifier: string,
): Promise<{ error: string; project: null; user: null } | { error: null; project: Project; user: User }> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", project: null, user: null };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。", project: null, user: null };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_news", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。", project: null, user: null };
  }

  return { error: null, project, user };
}

const updateNewsSchema = z.object({
  projectIdentifier: z.string().min(1),
  newsId: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().default(""),
  description: z.string().min(1),
});

export async function updateNewsAction(_prevState: NewsMutationActionState, formData: FormData): Promise<NewsMutationActionState> {
  const parsed = updateNewsSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    newsId: formData.get("newsId"),
    title: formData.get("title"),
    summary: formData.get("summary") ?? "",
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const authorized = await authorizeManageNews(parsed.data.projectIdentifier);
  if (authorized.project === null) {
    return { error: authorized.error };
  }

  const newsRepository = new DrizzleNewsRepository();
  const item = await newsRepository.findById(parsed.data.newsId);
  if (!item || item.projectId !== authorized.project.id) {
    return { error: "お知らせが見つかりません。" };
  }

  try {
    await updateNews(
      { newsRepository },
      { newsId: item.id, title: parsed.data.title, summary: parsed.data.summary, description: parsed.data.description },
    );
  } catch (error) {
    if (error instanceof InvalidNewsError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news/${item.id}`);
  return { error: null };
}

const deleteNewsCommentSchema = z.object({
  projectIdentifier: z.string().min(1),
  newsId: z.string().uuid(),
  commentId: z.string().uuid(),
});

/** CommentsController#destroy — authorized by `manage_news`, not by comment authorship. */
export async function deleteNewsCommentAction(_prevState: NewsMutationActionState, formData: FormData): Promise<NewsMutationActionState> {
  const parsed = deleteNewsCommentSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    newsId: formData.get("newsId"),
    commentId: formData.get("commentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const authorized = await authorizeManageNews(parsed.data.projectIdentifier);
  if (authorized.project === null) {
    return { error: authorized.error };
  }

  const item = await new DrizzleNewsRepository().findById(parsed.data.newsId);
  if (!item || item.projectId !== authorized.project.id) {
    return { error: "お知らせが見つかりません。" };
  }

  const commentRepository = new DrizzleNewsCommentRepository();
  const comment = await commentRepository.findById(parsed.data.commentId);
  if (!comment || comment.newsId !== item.id) {
    return { error: "コメントが見つかりません。" };
  }

  await commentRepository.delete(comment.id);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news/${item.id}`);
  return { error: null };
}

const uploadNewsAttachmentSchema = z.object({
  projectIdentifier: z.string().min(1),
  newsId: z.string().uuid(),
  description: z.string().default(""),
  file: z.instanceof(File),
});

export async function uploadNewsAttachmentAction(_prevState: NewsMutationActionState, formData: FormData): Promise<NewsMutationActionState> {
  const parsed = uploadNewsAttachmentSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    newsId: formData.get("newsId"),
    description: formData.get("description") ?? "",
    file: formData.get("file"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }
  if (parsed.data.file.size === 0) {
    return { error: "ファイルを選択してください。" };
  }

  const authorized = await authorizeManageNews(parsed.data.projectIdentifier);
  if (authorized.project === null) {
    return { error: authorized.error };
  }

  const item = await new DrizzleNewsRepository().findById(parsed.data.newsId);
  if (!item || item.projectId !== authorized.project.id) {
    return { error: "お知らせが見つかりません。" };
  }

  const buffer = Buffer.from(await parsed.data.file.arrayBuffer());
  try {
    await uploadAttachment(
      {
        attachmentRepository: new DrizzleAttachmentRepository(),
        attachmentStorage: new FsAttachmentStore(),
        settingsRepository: new DrizzleSettingsRepository(),
      },
      {
        containerType: "News",
        containerId: item.id,
        authorId: authorized.user.id,
        filename: parsed.data.file.name,
        contentType: parsed.data.file.type,
        description: parsed.data.description,
        data: buffer,
      },
    );
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news/${item.id}`);
  return { error: null };
}

const deleteNewsAttachmentSchema = z.object({
  projectIdentifier: z.string().min(1),
  newsId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

export async function deleteNewsAttachmentAction(_prevState: NewsMutationActionState, formData: FormData): Promise<NewsMutationActionState> {
  const parsed = deleteNewsAttachmentSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    newsId: formData.get("newsId"),
    attachmentId: formData.get("attachmentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const authorized = await authorizeManageNews(parsed.data.projectIdentifier);
  if (authorized.project === null) {
    return { error: authorized.error };
  }

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(parsed.data.attachmentId);
  if (!attachment || attachment.containerType !== "News" || attachment.containerId !== parsed.data.newsId) {
    return { error: "添付ファイルが見つかりません。" };
  }

  const item = await new DrizzleNewsRepository().findById(parsed.data.newsId);
  if (!item || item.projectId !== authorized.project.id) {
    return { error: "お知らせが見つかりません。" };
  }

  await attachmentRepository.delete(attachment.id);
  await new FsAttachmentStore().delete(attachment.storageKey);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/news/${item.id}`);
  return { error: null };
}
