"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { saveWikiPage } from "@/application/wiki/save-wiki-page";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiContentRepository, DrizzleWikiPageRepository } from "@/infrastructure/db/repositories/wiki-repository";
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

  await saveWikiPage(
    { wikiPageRepository: new DrizzleWikiPageRepository(), wikiContentRepository: new DrizzleWikiContentRepository() },
    {
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      text: parsed.data.text,
      comments: parsed.data.comments,
      authorId: user.id,
      parentId: null,
    },
  );

  redirect(`/projects/${parsed.data.projectIdentifier}/wiki/${encodeURIComponent(parsed.data.title)}`);
}
