"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
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
