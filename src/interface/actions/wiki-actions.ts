"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { InvalidAttachmentError } from "@/domain/attachment/validate";
import { filterMembersWithPermission, memberUserIds } from "@/domain/member/entity";
import { uploadAttachment } from "@/application/attachments/upload-attachment";
import { enqueueNotification } from "@/application/jobs/enqueue-notification";
import { isWikiPageEditable } from "@/domain/wiki/protection";
import { WikiPageNotFoundError, WikiTitleConflictError, renameWikiPage } from "@/application/wiki/rename-wiki-page";
import { WikiPageProtectedError, saveWikiPage } from "@/application/wiki/save-wiki-page";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import {
  DrizzleWikiContentRepository,
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type SaveWikiPageActionState = {
  error: string | null;
};

const saveWikiPageSchema = z.object({
  projectIdentifier: z.string().min(1),
  projectId: z.string().uuid(),
  title: z.string().min(1, "タイトルを入力してください。"),
  text: z.string(),
  comments: z.string().default(""),
});

export async function saveWikiPageAction(
  _prevState: SaveWikiPageActionState,
  formData: FormData,
): Promise<SaveWikiPageActionState> {
  const parsed = saveWikiPageSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    text: formData.get("text") ?? "",
    comments: formData.get("comments") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findById(parsed.data.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "edit_wiki_pages", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  let page;
  try {
    ({ page } = await saveWikiPage(
      { wikiPageRepository: new DrizzleWikiPageRepository(), wikiContentRepository: new DrizzleWikiContentRepository() },
      {
        projectId: parsed.data.projectId,
        title: parsed.data.title,
        text: parsed.data.text,
        comments: parsed.data.comments,
        authorId: user.id,
        parentId: null,
        canProtect: can({ permission: "protect_wiki_pages", project: toAuthorizationProject(project), actor }),
      },
    ));
  } catch (error) {
    if (error instanceof WikiPageProtectedError) {
      return { error: "このページは保護されています。" };
    }
    throw error;
  }

  const members = await new DrizzleMemberRepository().listByProject(project.id);
  const rolesById = new Map(
    (await new DrizzleRoleRepository().findByIds([...new Set(members.flatMap((m) => m.roleIds))])).map((role) => [role.id, role]),
  );
  const notifiableMembers = filterMembersWithPermission(members, rolesById, "view_wiki_pages");
  const watcherUserIds = await new DrizzleWatcherRepository().listWatcherUserIds("WikiPage", page.id);
  await enqueueNotification(
    { jobRepository: new DrizzleJobRepository() },
    {
      recipientGroups: [memberUserIds(notifiableMembers), watcherUserIds],
      excludeUserId: user.id,
      subject: `[${project.name}] ${page.title}`,
      body: parsed.data.text,
    },
  );

  redirect(`/projects/${parsed.data.projectIdentifier}/wiki/${encodeURIComponent(parsed.data.title)}`);
}

export type UploadWikiAttachmentActionState = {
  error: string | null;
};

const uploadWikiAttachmentSchema = z.object({
  pageId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  title: z.string().min(1),
  file: z.instanceof(File),
});

// Mirrors Redmine's WikiController#add_attachment: edit_wiki_pages plus the page's own
// protection gate (acts_as_attachable's default :add_permission is the container's edit
// permission; the controller additionally requires editable?).
export async function uploadWikiAttachmentAction(
  _prevState: UploadWikiAttachmentActionState,
  formData: FormData,
): Promise<UploadWikiAttachmentActionState> {
  const parsed = uploadWikiAttachmentSchema.safeParse({
    pageId: formData.get("pageId"),
    projectIdentifier: formData.get("projectIdentifier"),
    title: formData.get("title"),
    file: formData.get("file"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }
  if (parsed.data.file.size === 0) {
    return { error: "ファイルを選択してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const wikiPage = await new DrizzleWikiPageRepository().findById(parsed.data.pageId);
  if (!wikiPage) {
    return { error: "Wikiページが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(wikiPage.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "edit_wiki_pages", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isWikiPageEditable(wikiPage, can({ permission: "protect_wiki_pages", project: toAuthorizationProject(project), actor }))) {
    return { error: "このページは保護されています。" };
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
        containerType: "WikiPage",
        containerId: wikiPage.id,
        authorId: user.id,
        filename: parsed.data.file.name,
        contentType: parsed.data.file.type,
        data: buffer,
      },
    );
  } catch (error) {
    if (error instanceof InvalidAttachmentError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/wiki/${encodeURIComponent(parsed.data.title)}`);
  return { error: null };
}

export type DeleteWikiAttachmentActionState = {
  error: string | null;
};

const deleteWikiAttachmentSchema = z.object({
  attachmentId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  title: z.string().min(1),
});

export async function deleteWikiAttachmentAction(
  _prevState: DeleteWikiAttachmentActionState,
  formData: FormData,
): Promise<DeleteWikiAttachmentActionState> {
  const parsed = deleteWikiAttachmentSchema.safeParse({
    attachmentId: formData.get("attachmentId"),
    projectIdentifier: formData.get("projectIdentifier"),
    title: formData.get("title"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachment = await attachmentRepository.findById(parsed.data.attachmentId);
  if (!attachment || attachment.containerType !== "WikiPage" || !attachment.containerId) {
    return { error: "添付ファイルが見つかりません。" };
  }

  const wikiPage = await new DrizzleWikiPageRepository().findById(attachment.containerId);
  if (!wikiPage) {
    return { error: "Wikiページが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(wikiPage.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  // Redmine's acts_as_attachable :delete_permission => :delete_wiki_pages_attachments
  // (wiki_page.rb#L30) — a dedicated permission, not edit_wiki_pages — combined with
  // WikiPage#attachments_deletable?, which also demands the page be editable.
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "delete_wiki_pages_attachments", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (!isWikiPageEditable(wikiPage, can({ permission: "protect_wiki_pages", project: toAuthorizationProject(project), actor }))) {
    return { error: "このページは保護されています。" };
  }

  await attachmentRepository.delete(attachment.id);
  await new FsAttachmentStore().delete(attachment.storageKey);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/wiki/${encodeURIComponent(parsed.data.title)}`);
  return { error: null };
}

export type RenameWikiPageActionState = {
  error: string | null;
};

const renameWikiPageSchema = z.object({
  pageId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  newTitle: z.string().min(1, "タイトルを入力してください。"),
  keepRedirect: z.literal("on").optional(),
});

export async function renameWikiPageAction(
  _prevState: RenameWikiPageActionState,
  formData: FormData,
): Promise<RenameWikiPageActionState> {
  const parsed = renameWikiPageSchema.safeParse({
    pageId: formData.get("pageId"),
    projectIdentifier: formData.get("projectIdentifier"),
    newTitle: formData.get("newTitle"),
    keepRedirect: formData.get("keepRedirect") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const wikiPage = await new DrizzleWikiPageRepository().findById(parsed.data.pageId);
  if (!wikiPage) {
    return { error: "Wikiページが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(wikiPage.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  // Redmine maps `wiki#rename` to both rename_wiki_pages and manage_wiki
  // (preparation.rb#L128,#L135), so either one grants it.
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  const canRename =
    can({ permission: "rename_wiki_pages", project: projectContext, actor }) ||
    can({ permission: "manage_wiki", project: projectContext, actor });
  if (!canRename) {
    return { error: "この操作を行う権限がありません。" };
  }

  let renamed;
  try {
    renamed = await renameWikiPage(
      { wikiPageRepository: new DrizzleWikiPageRepository(), wikiRedirectRepository: new DrizzleWikiRedirectRepository() },
      {
        pageId: parsed.data.pageId,
        newTitle: parsed.data.newTitle,
        keepRedirect: parsed.data.keepRedirect === "on",
        canProtect: can({ permission: "protect_wiki_pages", project: projectContext, actor }),
      },
    );
  } catch (error) {
    if (error instanceof WikiTitleConflictError) {
      return { error: `「${parsed.data.newTitle}」という名前のページは既に存在します。` };
    }
    if (error instanceof WikiPageNotFoundError) {
      return { error: "Wikiページが見つかりません。" };
    }
    if (error instanceof WikiPageProtectedError) {
      return { error: "このページは保護されています。" };
    }
    throw error;
  }

  redirect(`/projects/${parsed.data.projectIdentifier}/wiki/${encodeURIComponent(renamed.title)}`);
}
