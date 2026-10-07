"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import type { ScmRepository } from "@/domain/scm/entity";
import { connectRepository, InvalidRepositoryError } from "@/application/scm/connect-repository";
import { updateRepository } from "@/application/scm/update-repository";
import { syncChangesets } from "@/application/scm/sync-changesets";
import { loadCommitKeywordSettings } from "@/application/settings/commit-keyword-settings";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { scmBrowserFor } from "@/infrastructure/scm/browser-for-vendor";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ScmActionState = {
  error: string | null;
};

/**
 * Every repository action is `manage_repository` (Redmine's preparation.rb groups new/create/
 * edit/update/destroy/committers/fetch_changesets under it), so the project lookup plus the
 * permission check is the same preamble each time.
 */
async function authorizeManageRepository(projectIdentifier: string): Promise<{ project: Project } | { error: string }> {
  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。" };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。" };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_repository", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }
  return { project };
}

/** Resolves a repository id that arrived in a form, refusing one that belongs to another project. */
async function findOwnRepository(projectId: string, scmRepositoryId: string): Promise<ScmRepository | null> {
  const repository = await new DrizzleScmRepositoryRepository().findById(scmRepositoryId);
  return repository && repository.projectId === projectId ? repository : null;
}

const connectRepositorySchema = z.object({
  projectIdentifier: z.string().min(1),
  identifier: z.string().default(""),
  vendor: z.enum(["git", "subversion", "mercurial"]),
  rootPath: z.string().min(1),
  isDefault: z.boolean(),
});

export async function connectRepositoryAction(_prevState: ScmActionState, formData: FormData): Promise<ScmActionState> {
  const parsed = connectRepositorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    identifier: formData.get("identifier") ?? "",
    vendor: formData.get("vendor"),
    rootPath: formData.get("rootPath"),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const authorized = await authorizeManageRepository(parsed.data.projectIdentifier);
  if ("error" in authorized) {
    return authorized;
  }

  try {
    await connectRepository(
      { scmRepositoryRepository: new DrizzleScmRepositoryRepository() },
      {
        projectId: authorized.project.id,
        identifier: parsed.data.identifier,
        vendor: parsed.data.vendor,
        rootPath: parsed.data.rootPath,
        isDefault: parsed.data.isDefault,
      },
    );
  } catch (error) {
    if (error instanceof InvalidRepositoryError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repositories`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repository`);
  return { error: null };
}

const updateRepositorySchema = z.object({
  projectIdentifier: z.string().min(1),
  scmRepositoryId: z.string().uuid(),
  identifier: z.string().default(""),
  isDefault: z.boolean(),
});

export async function updateRepositoryAction(_prevState: ScmActionState, formData: FormData): Promise<ScmActionState> {
  const parsed = updateRepositorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    scmRepositoryId: formData.get("scmRepositoryId"),
    identifier: formData.get("identifier") ?? "",
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const authorized = await authorizeManageRepository(parsed.data.projectIdentifier);
  if ("error" in authorized) {
    return authorized;
  }
  if (!(await findOwnRepository(authorized.project.id, parsed.data.scmRepositoryId))) {
    return { error: "リポジトリが見つかりません。" };
  }

  try {
    await updateRepository(
      { scmRepositoryRepository: new DrizzleScmRepositoryRepository() },
      { scmRepositoryId: parsed.data.scmRepositoryId, identifier: parsed.data.identifier, isDefault: parsed.data.isDefault },
    );
  } catch (error) {
    if (error instanceof InvalidRepositoryError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repositories`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repository`);
  return { error: null };
}

const deleteRepositorySchema = z.object({
  projectIdentifier: z.string().min(1),
  scmRepositoryId: z.string().uuid(),
});

export async function deleteRepositoryAction(_prevState: ScmActionState, formData: FormData): Promise<ScmActionState> {
  const parsed = deleteRepositorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    scmRepositoryId: formData.get("scmRepositoryId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  }

  const authorized = await authorizeManageRepository(parsed.data.projectIdentifier);
  if ("error" in authorized) {
    return authorized;
  }
  if (!(await findOwnRepository(authorized.project.id, parsed.data.scmRepositoryId))) {
    return { error: "リポジトリが見つかりません。" };
  }

  // Redmine's destroy has no validation of its own: the changesets (and their issue links) go
  // with it, but the journals and time entries its commit keywords already produced stay —
  // deleting a repository doesn't undo what it did to issues.
  await new DrizzleScmRepositoryRepository().delete(parsed.data.scmRepositoryId);

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repositories`);
  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repository`);
  return { error: null };
}

export type SyncRepositoryActionState = {
  error: string | null;
  summary: string | null;
};

const syncRepositorySchema = z.object({
  projectIdentifier: z.string().min(1),
  scmRepositoryId: z.string().uuid(),
});

/** Ingests new commits as Changesets and applies commit-message keyword linking — see application/scm/sync-changesets.ts. */
export async function syncRepositoryAction(
  _prevState: SyncRepositoryActionState,
  formData: FormData,
): Promise<SyncRepositoryActionState> {
  const parsed = syncRepositorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    scmRepositoryId: formData.get("scmRepositoryId"),
  });
  if (!parsed.success) {
    return { error: "入力内容を確認してください。", summary: null };
  }

  const authorized = await authorizeManageRepository(parsed.data.projectIdentifier);
  if ("error" in authorized) {
    return { ...authorized, summary: null };
  }

  const scmRepository = await findOwnRepository(authorized.project.id, parsed.data.scmRepositoryId);
  if (!scmRepository) {
    return { error: "リポジトリが見つかりません。", summary: null };
  }

  const { keywordScanOptions, logtimeEnabled } = await loadCommitKeywordSettings(new DrizzleSettingsRepository());

  const result = await syncChangesets(
    {
      scmBrowser: scmBrowserFor(scmRepository.vendor),
      changesetRepository: new DrizzleChangesetRepository(),
      issueRepository: new DrizzleIssueRepository(),
      issueStatusRepository: new DrizzleIssueStatusRepository(),
      timeEntryRepository: new DrizzleTimeEntryRepository(),
      enumerationRepository: new DrizzleEnumerationRepository(),
      userRepository: new DrizzleUserRepository(),
      settingsRepository: new DrizzleSettingsRepository(),
    },
    scmRepository,
    "HEAD",
    200,
    keywordScanOptions,
    logtimeEnabled,
  );

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repository`);
  return {
    error: null,
    summary: `${result.ingested}件のコミットを取り込みました（うち、自動クローズ ${result.fixed}件、工数記録 ${result.timeLogged}件）。`,
  };
}
