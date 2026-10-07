"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { deleteProjectWiki } from "@/application/wiki/delete-project-wiki";
import { InvalidReassignTargetError, deleteWikiPage } from "@/application/wiki/delete-wiki-page";
import { WikiPageNotFoundError } from "@/application/wiki/rename-wiki-page";
import { WikiPageProtectedError } from "@/application/wiki/save-wiki-page";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import {
  DrizzleWikiPageRepository,
  DrizzleWikiRedirectRepository,
  DrizzleWikiRepository,
} from "@/infrastructure/db/repositories/wiki-repository";
import { FsAttachmentStore } from "@/infrastructure/storage/fs-attachment-store";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type WikiPageActionState = {
  error: string | null;
};

const setWikiPageProtectionSchema = z.object({
  pageId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  title: z.string().min(1),
  isProtected: z.enum(["0", "1"]),
});

/**
 * Mirrors WikiController#protect: a single `protected` flag write gated by protect_wiki_pages,
 * with no editable? pre-check — that permission is exactly what the protection gate defers to,
 * so holding it is what makes the page editable in the first place.
 */
export async function setWikiPageProtectionAction(
  _prevState: WikiPageActionState,
  formData: FormData,
): Promise<WikiPageActionState> {
  const parsed = setWikiPageProtectionSchema.safeParse({
    pageId: formData.get("pageId"),
    projectIdentifier: formData.get("projectIdentifier"),
    title: formData.get("title"),
    isProtected: formData.get("isProtected"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const wikiPageRepository = new DrizzleWikiPageRepository();
  const wikiPage = await wikiPageRepository.findById(parsed.data.pageId);
  if (!wikiPage) {
    return { error: "Wikiページが見つかりません。" };
  }

  const project = await new DrizzleProjectRepository().findById(wikiPage.projectId);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "protect_wiki_pages", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await wikiPageRepository.setProtected(wikiPage.id, parsed.data.isProtected === "1");

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/wiki/${encodeURIComponent(parsed.data.title)}`);
  return { error: null };
}

const deleteWikiPageSchema = z.object({
  pageId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
  childrenDisposition: z.enum(["nullify", "destroy", "reassign"]),
  reassignToId: z.string().uuid().nullable(),
});

/**
 * Mirrors WikiController#destroy. The confirmation screen that offers the three dispositions
 * lives at wiki/[title]/destroy; this action is what it submits to.
 */
export async function deleteWikiPageAction(
  _prevState: WikiPageActionState,
  formData: FormData,
): Promise<WikiPageActionState> {
  const reassignToId = formData.get("reassignToId");
  const parsed = deleteWikiPageSchema.safeParse({
    pageId: formData.get("pageId"),
    projectIdentifier: formData.get("projectIdentifier"),
    childrenDisposition: formData.get("childrenDisposition") ?? "nullify",
    reassignToId: typeof reassignToId === "string" && reassignToId.length > 0 ? reassignToId : null,
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

  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "delete_wiki_pages", project: projectContext, actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  try {
    await deleteWikiPage(
      {
        wikiPageRepository: new DrizzleWikiPageRepository(),
        wikiRedirectRepository: new DrizzleWikiRedirectRepository(),
        attachmentRepository: new DrizzleAttachmentRepository(),
        attachmentStorage: new FsAttachmentStore(),
        watcherRepository: new DrizzleWatcherRepository(),
      },
      {
        pageId: parsed.data.pageId,
        childrenDisposition: parsed.data.childrenDisposition,
        reassignToId: parsed.data.reassignToId,
        canProtect: can({ permission: "protect_wiki_pages", project: projectContext, actor }),
      },
    );
  } catch (error) {
    if (error instanceof WikiPageProtectedError) {
      return { error: "このページは保護されています。" };
    }
    if (error instanceof WikiPageNotFoundError) {
      return { error: "Wikiページが見つかりません。" };
    }
    if (error instanceof InvalidReassignTargetError) {
      return { error: "子ページの移動先として選べないページです。" };
    }
    throw error;
  }

  redirect(`/projects/${parsed.data.projectIdentifier}/wiki/index`);
}

const wikiSettingsSchema = z.object({
  projectId: z.string().uuid(),
  projectIdentifier: z.string().min(1),
});

/**
 * Mirrors the Wiki model's `start_page` safe attribute, which Redmine gates on manage_wiki.
 * The format check is Wiki's own validates_format_of: a start page is a page title, so the
 * characters WikiPage rejects in a title are rejected here too.
 */
const WIKI_START_PAGE_INVALID = /[,.\/?;|:\s]/;

export async function updateWikiStartPageAction(
  _prevState: WikiPageActionState,
  formData: FormData,
): Promise<WikiPageActionState> {
  const parsed = wikiSettingsSchema.extend({ startPage: z.string().min(1, "開始ページを入力してください。") }).safeParse({
    projectId: formData.get("projectId"),
    projectIdentifier: formData.get("projectIdentifier"),
    startPage: formData.get("startPage"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }
  if (WIKI_START_PAGE_INVALID.test(parsed.data.startPage)) {
    return { error: "開始ページ名に使用できない文字が含まれています。" };
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
  if (!can({ permission: "manage_wiki", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await new DrizzleWikiRepository().setStartPage(project.id, parsed.data.startPage);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/settings/wiki`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/wiki`);
  return { error: null };
}

/** Mirrors WikisController#destroy: manage_wiki, no per-page protection check. */
export async function deleteProjectWikiAction(
  _prevState: WikiPageActionState,
  formData: FormData,
): Promise<WikiPageActionState> {
  const parsed = wikiSettingsSchema.extend({ confirm: z.literal("on") }).safeParse({
    projectId: formData.get("projectId"),
    projectIdentifier: formData.get("projectIdentifier"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: "削除を確認するチェックボックスをオンにしてください。" };
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
  if (!can({ permission: "manage_wiki", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  await deleteProjectWiki(
    {
      wikiPageRepository: new DrizzleWikiPageRepository(),
      wikiRedirectRepository: new DrizzleWikiRedirectRepository(),
      attachmentRepository: new DrizzleAttachmentRepository(),
      attachmentStorage: new FsAttachmentStore(),
      watcherRepository: new DrizzleWatcherRepository(),
      wikiRepository: new DrizzleWikiRepository(),
    },
    project.id,
  );

  redirect(`/projects/${parsed.data.projectIdentifier}`);
}
