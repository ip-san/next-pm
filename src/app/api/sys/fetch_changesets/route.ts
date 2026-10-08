import { NextResponse } from "next/server";
import { fetchSysChangesets } from "@/application/scm/sys-api";
import { syncChangesets } from "@/application/scm/sync-changesets";
import { loadCommitKeywordSettings } from "@/application/settings/commit-keyword-settings";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectActivityRepository } from "@/infrastructure/db/repositories/project-activity-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { scmBrowserFor } from "@/infrastructure/scm/browser-for-vendor";
import { SYS_API_DENIED, sysApiAuthorized } from "@/interface/http/sys-api-auth";

/**
 * Redmine's `/sys/fetch_changesets` (GET and POST): pull new commits for one project (`id`, an id
 * or identifier) or for every repository-enabled project. 404 when the named project is not one
 * the service may see.
 */
export async function GET(request: Request) {
  return fetchChangesets(request);
}

export async function POST(request: Request) {
  return fetchChangesets(request);
}

async function fetchChangesets(request: Request) {
  if (!(await sysApiAuthorized(request))) return SYS_API_DENIED;
  const id = new URL(request.url).searchParams.get("id");
  const { keywordScanOptions, logtimeEnabled, crossProjectRef } = await loadCommitKeywordSettings(new DrizzleSettingsRepository());

  const result = await fetchSysChangesets(
    { projectRepository: new DrizzleProjectRepository(), scmRepositoryRepository: new DrizzleScmRepositoryRepository() },
    id,
    (repository) =>
      syncChangesets(
        {
          scmBrowser: scmBrowserFor(repository.vendor),
          changesetRepository: new DrizzleChangesetRepository(),
          issueRepository: new DrizzleIssueRepository(),
          issueStatusRepository: new DrizzleIssueStatusRepository(),
          timeEntryRepository: new DrizzleTimeEntryRepository(),
          enumerationRepository: new DrizzleEnumerationRepository(),
          projectActivityRepository: new DrizzleProjectActivityRepository(),
          userRepository: new DrizzleUserRepository(),
          projectRepository: new DrizzleProjectRepository(),
          settingsRepository: new DrizzleSettingsRepository(),
        },
        repository,
        "HEAD",
        200,
        keywordScanOptions,
        logtimeEnabled,
        crossProjectRef,
      ),
  );
  return new NextResponse(null, { status: result === "ok" ? 200 : 404 });
}
