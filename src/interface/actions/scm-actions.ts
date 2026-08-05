"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { connectRepository, InvalidRepositoryError } from "@/application/scm/connect-repository";
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
import { GitCliBrowser } from "@/infrastructure/scm/git-cli-browser";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ConnectRepositoryActionState = {
  error: string | null;
};

const connectRepositorySchema = z.object({
  projectIdentifier: z.string().min(1),
  rootPath: z.string().min(1),
});

export async function connectRepositoryAction(
  _prevState: ConnectRepositoryActionState,
  formData: FormData,
): Promise<ConnectRepositoryActionState> {
  const parsed = connectRepositorySchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    rootPath: formData.get("rootPath"),
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
  if (!can({ permission: "manage_repository", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。" };
  }

  try {
    await connectRepository(
      { scmRepositoryRepository: new DrizzleScmRepositoryRepository() },
      { projectId: project.id, rootPath: parsed.data.rootPath },
    );
  } catch (error) {
    if (error instanceof InvalidRepositoryError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/repository`);
  return { error: null };
}

export type SyncRepositoryActionState = {
  error: string | null;
  summary: string | null;
};

const syncRepositorySchema = z.object({
  projectIdentifier: z.string().min(1),
});

/** Ingests new commits as Changesets and applies commit-message keyword linking — see application/scm/sync-changesets.ts. */
export async function syncRepositoryAction(
  _prevState: SyncRepositoryActionState,
  formData: FormData,
): Promise<SyncRepositoryActionState> {
  const parsed = syncRepositorySchema.safeParse({ projectIdentifier: formData.get("projectIdentifier") });
  if (!parsed.success) {
    return { error: "入力内容を確認してください。", summary: null };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", summary: null };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。", summary: null };
  }

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_repository", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。", summary: null };
  }

  const scmRepository = await new DrizzleScmRepositoryRepository().findByProject(project.id);
  if (!scmRepository) {
    return { error: "このプロジェクトにはリポジトリが設定されていません。", summary: null };
  }

  const { keywordScanOptions, logtimeEnabled } = await loadCommitKeywordSettings(new DrizzleSettingsRepository());

  const result = await syncChangesets(
    {
      gitBrowser: new GitCliBrowser(),
      changesetRepository: new DrizzleChangesetRepository(),
      issueRepository: new DrizzleIssueRepository(),
      issueStatusRepository: new DrizzleIssueStatusRepository(),
      timeEntryRepository: new DrizzleTimeEntryRepository(),
      enumerationRepository: new DrizzleEnumerationRepository(),
      userRepository: new DrizzleUserRepository(),
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
