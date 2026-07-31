"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { compileFilters, type FilterCondition } from "@/domain/query/filter-builder";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleQueryRepository } from "@/infrastructure/db/repositories/query-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type SaveQueryActionState = {
  error: string | null;
};

const saveQuerySchema = z.object({
  projectIdentifier: z.string().min(1),
  name: z.string().min(1),
  visibility: z.enum(["private", "public"]).default("private"),
  filters: z.string(),
});

// Saves the current issue-list filter as a named Query, reusing the exact FilterCondition[]
// shape the issues page already compiles via compileFilters — no separate representation.
export async function saveQueryAction(_prevState: SaveQueryActionState, formData: FormData): Promise<SaveQueryActionState> {
  const parsed = saveQuerySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    name: formData.get("name"),
    visibility: formData.get("visibility") ?? "private",
    filters: formData.get("filters") ?? "[]",
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
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_issues", project: projectContext, actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (parsed.data.visibility === "public" && !can({ permission: "edit_issues", project: projectContext, actor })) {
    return { error: "公開クエリを作成する権限がありません。" };
  }

  let filters: FilterCondition[];
  try {
    filters = JSON.parse(parsed.data.filters);
    compileFilters(filters);
  } catch {
    return { error: "フィルタ内容が不正です。" };
  }

  await new DrizzleQueryRepository().create({
    name: parsed.data.name,
    projectId: project.id,
    userId: user.id,
    visibility: parsed.data.visibility,
    filters,
    roleIds: [],
  });

  redirect(`/projects/${parsed.data.projectIdentifier}/issues`);
}
