"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createProject } from "@/application/projects/create-project";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";

const AVAILABLE_MODULES = ["issue_tracking", "time_tracking", "wiki", "boards", "news", "documents", "files", "repository"] as const;

const createProjectSchema = z.object({
  name: z.string().min(1),
  identifier: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "半角英数字・ハイフン・アンダースコアのみ使用できます"),
  description: z.string().default(""),
  isPublic: z.coerce.boolean().default(true),
  parentId: z.string().uuid().nullable(),
  enabledModules: z.array(z.enum(AVAILABLE_MODULES)).default([]),
  trackerIds: z.array(z.string().uuid()).default([]),
});

export type CreateProjectActionState = {
  error: string | null;
};

export async function createProjectAction(
  _prevState: CreateProjectActionState,
  formData: FormData,
): Promise<CreateProjectActionState> {
  const parentIdRaw = formData.get("parentId");
  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    identifier: formData.get("identifier"),
    description: formData.get("description") ?? "",
    isPublic: formData.get("isPublic") === "on",
    parentId: parentIdRaw ? parentIdRaw : null,
    enabledModules: formData.getAll("enabledModules"),
    trackerIds: formData.getAll("trackerIds"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  let identifier: string;
  try {
    const project = await createProject(new DrizzleProjectRepository(), parsed.data);
    identifier = project.identifier;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "プロジェクトを作成できませんでした。" };
  }

  redirect(`/projects/${identifier}`);
}
