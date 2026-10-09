import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import type { ScmRepository } from "@/domain/scm/entity";
import { InvalidRefError, InvalidRepositoryPathError } from "@/domain/scm/validate-path";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { scmBrowserFor } from "@/infrastructure/scm/browser-for-vendor";
import { issueVisibilityCheck, listVisibleProjectContexts } from "@/interface/http/resolve-actor";
import { LinkRelatedIssueForm, UnlinkRelatedIssueForm } from "./related-issue-forms";
import { loadRepositoryContext, repositoryPath } from "./repository-context";
import { SyncRepositoryButton } from "./sync-repository-button";

/** Redmine's `Repository#name`: the identifier, or a "main repository" label for the unnamed default. */
export function repositoryLabel(repository: ScmRepository, locale: Locale = "ja"): string {
  if (repository.identifier.length > 0) return repository.identifier;
  return repository.isDefault ? translate(locale, "repository.mainRepository") : repository.vendor;
}

/** Redmine's repository navigation strip — only rendered once a project actually has a second repository. */
function RepositorySwitcher({
  projectIdentifier,
  repositories,
  current,
  locale,
}: {
  projectIdentifier: string;
  repositories: ScmRepository[];
  current: ScmRepository;
  locale: Locale;
}) {
  if (repositories.length < 2) return null;
  return (
    <nav className="flex gap-3 text-sm border-b pb-2">
      {repositories.map((repository) =>
        repository.id === current.id ? (
          <span key={repository.id} className="font-semibold">
            {repositoryLabel(repository, locale)}
          </span>
        ) : (
          <Link key={repository.id} href={repositoryPath(projectIdentifier, repository)} className="underline">
            {repositoryLabel(repository, locale)}
          </Link>
        ),
      )}
    </nav>
  );
}

export async function RepositoryBrowseView({
  projectIdentifier,
  repositoryParam,
  path,
  revision,
}: {
  projectIdentifier: string;
  repositoryParam?: string;
  path?: string;
  /** The `?ref=` query value. Named `revision` here because React reserves the prop name `ref`. */
  revision?: string;
}) {
  const locale = await currentLocale();
  const currentPath = path ?? "";
  const currentRef = revision ?? "HEAD";
  const context = await loadRepositoryContext(projectIdentifier, repositoryParam, "browse_repository");
  const { scmRepository, basePath, projectContext, actor } = context;

  const canManage = can({ permission: "manage_repository", project: projectContext, actor });
  const canViewChangesets = can({ permission: "view_changesets", project: projectContext, actor });

  const browser = scmBrowserFor(scmRepository.vendor);
  let entries: Awaited<ReturnType<typeof browser.listTree>> = [];
  let commits: Awaited<ReturnType<typeof browser.log>> = [];
  let fileContent: string | null = null;
  let error: string | null = null;
  try {
    entries = await browser.listTree(scmRepository.rootPath, currentRef, currentPath);
  } catch (listError) {
    if (listError instanceof InvalidRefError || listError instanceof InvalidRepositoryPathError) {
      error = listError.message;
    } else {
      // Not a tree — try it as a file instead of giving up.
      try {
        fileContent = await browser.readFile(scmRepository.rootPath, currentRef, currentPath);
      } catch {
        error = translate(locale, "repository.pathNotFound");
      }
    }
  }
  if (!error && canViewChangesets) {
    try {
      const { repositoryLogDisplayLimit } = resolveGeneralSettings(await new DrizzleSettingsRepository().getAll());
      commits = await browser.log(scmRepository.rootPath, currentRef, repositoryLogDisplayLimit);
    } catch {
      // Log failure shouldn't block showing the tree/file above.
    }
  }

  const parentPath = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "repository.browseTitle"), { repository: repositoryLabel(scmRepository, locale) })}</h1>
      <RepositorySwitcher locale={locale} projectIdentifier={projectIdentifier} repositories={context.repositories} current={scmRepository} />
      <p className="text-sm text-gray-500">
        {currentRef} — /{currentPath}
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {fileContent !== null ? (
        <>
          <Link
            href={`${basePath}/blame?path=${encodeURIComponent(currentPath)}&ref=${encodeURIComponent(currentRef)}`}
            className="underline text-sm self-start"
          >
            {translate(locale, "repository.blameLink")}
          </Link>
          <pre className="text-xs font-mono border rounded p-3 overflow-x-auto whitespace-pre">{fileContent}</pre>
        </>
      ) : (
        <ul className="flex flex-col gap-1 text-sm font-mono">
          {currentPath.length > 0 ? (
            <li>
              <Link href={`${basePath}?path=${encodeURIComponent(parentPath)}&ref=${encodeURIComponent(currentRef)}`} className="underline">
                ..
              </Link>
            </li>
          ) : null}
          {entries.map((entry) => (
            <li key={entry.path}>
              <Link href={`${basePath}?path=${encodeURIComponent(entry.path)}&ref=${encodeURIComponent(currentRef)}`} className="underline">
                {entry.kind === "tree" ? "📁" : "📄"} {entry.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canViewChangesets ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{translate(locale, "repository.recentCommits")}</h2>
            {canManage ? <SyncRepositoryButton locale={locale} projectIdentifier={projectIdentifier} scmRepositoryId={scmRepository.id} /> : null}
          </div>
          <ul className="flex flex-col gap-1 text-xs">
            {commits.map((commit) => (
              <li key={commit.hash} className="border-b pb-1">
                <Link href={`${basePath}/revisions/${commit.hash}`} className="font-mono underline">
                  {commit.hash.slice(0, 8)}
                </Link>{" "}
                {commit.message.split("\n")[0]} — {commit.author}, {commit.date}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

export async function RepositoryBlameView({
  projectIdentifier,
  repositoryParam,
  path,
  revision,
}: {
  projectIdentifier: string;
  repositoryParam?: string;
  path?: string;
  /** The `?ref=` query value. Named `revision` here because React reserves the prop name `ref`. */
  revision?: string;
}) {
  const locale = await currentLocale();
  const currentPath = path ?? "";
  const currentRef = revision ?? "HEAD";
  const context = await loadRepositoryContext(projectIdentifier, repositoryParam, "browse_repository");
  if (currentPath.length === 0) {
    notFound();
  }
  const { scmRepository, basePath, projectContext, actor } = context;
  const canViewChangesets = can({ permission: "view_changesets", project: projectContext, actor });

  const browser = scmBrowserFor(scmRepository.vendor);
  let lines: Awaited<ReturnType<typeof browser.blame>> = [];
  let error: string | null = null;
  try {
    lines = await browser.blame(scmRepository.rootPath, currentRef, currentPath);
  } catch (blameError) {
    error = blameError instanceof InvalidRefError || blameError instanceof InvalidRepositoryPathError ? blameError.message : translate(locale, "repository.targetNotFound");
  }

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold font-mono">{interpolate(translate(locale, "repository.blameTitle"), { path: currentPath })}</h1>
        <Link href={`${basePath}?path=${encodeURIComponent(currentPath)}&ref=${encodeURIComponent(currentRef)}`} className="underline text-sm">
          {translate(locale, "repository.viewFile")}
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <table className="text-xs font-mono border-collapse w-full">
          <tbody>
            {lines.map((line) => (
              <tr key={line.lineNumber} className="align-top">
                <td className="pr-2 text-gray-400 text-right select-none">{line.lineNumber}</td>
                <td className="pr-3 whitespace-nowrap text-gray-600">
                  {canViewChangesets ? (
                    <Link href={`${basePath}/revisions/${line.commitHash}`} className="underline">
                      {line.commitHash.slice(0, 8)}
                    </Link>
                  ) : (
                    line.commitHash.slice(0, 8)
                  )}{" "}
                  {line.author} {line.date}
                </td>
                <td className="whitespace-pre">{line.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function diffLineClassName(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-gray-500";
  if (line.startsWith("+")) return "bg-green-50 text-green-800";
  if (line.startsWith("-")) return "bg-red-50 text-red-800";
  if (line.startsWith("@@")) return "text-blue-700 font-medium";
  return "";
}

/**
 * Redmine's `_related_issues` partial. It renders whenever the changeset already has visible
 * issues or the viewer may manage them, which is also when the whole section has anything to
 * say. The list is empty for a revision no sync has stored yet — adding one materializes the
 * changeset row on demand (application/scm/find-or-create-changeset.ts).
 */
async function RelatedIssues({
  projectIdentifier,
  repositoryParam,
  context,
  revision,
}: {
  projectIdentifier: string;
  repositoryParam: string;
  context: Awaited<ReturnType<typeof loadRepositoryContext>>;
  revision: string;
}) {
  const locale = await currentLocale();
  const canManage = can({ permission: "manage_related_issues", project: context.projectContext, actor: context.actor });

  const changeset = await new DrizzleChangesetRepository().findByRevision(context.scmRepository.id, revision);
  const issueRepository = new DrizzleIssueRepository();
  const linkedIssues = changeset
    ? (await Promise.all((await new DrizzleChangesetRepository().listIssueIds(changeset.id)).map((id) => issueRepository.findById(id))))
        .filter((issue) => issue !== null)
        .filter(issueVisibilityCheck(context.user, await listVisibleProjectContexts(context.user, "view_issues")))
    : [];

  if (linkedIssues.length === 0 && !canManage) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-sm">{translate(locale, "repository.relatedIssues")}</h2>
      {linkedIssues.length === 0 ? (
        <p className="text-sm text-gray-500">{translate(locale, "repository.noRelated")}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {linkedIssues.map((issue) => (
            <li key={issue.id} className="flex items-center gap-2">
              <Link href={`/projects/${projectIdentifier}/issues/${issue.id}`} className="underline">
                #{issue.number} {issue.subject}
              </Link>
              {canManage ? (
                <UnlinkRelatedIssueForm locale={locale}
                  projectIdentifier={projectIdentifier}
                  repositoryParam={repositoryParam}
                  revision={revision}
                  issueId={issue.id}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? <LinkRelatedIssueForm locale={locale} projectIdentifier={projectIdentifier} repositoryParam={repositoryParam} revision={revision} /> : null}
    </section>
  );
}

export async function RepositoryRevisionView({
  projectIdentifier,
  repositoryParam,
  hash,
}: {
  projectIdentifier: string;
  repositoryParam?: string;
  hash: string;
}) {
  const locale = await currentLocale();
  const context = await loadRepositoryContext(projectIdentifier, repositoryParam, "view_changesets");
  const { scmRepository, basePath } = context;

  let diff: string | null = null;
  let error: string | null = null;
  try {
    diff = await scmBrowserFor(scmRepository.vendor).diff(scmRepository.rootPath, hash);
  } catch (diffError) {
    error = diffError instanceof InvalidRefError ? diffError.message : translate(locale, "repository.revisionNotFound");
  }

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold font-mono">{interpolate(translate(locale, "repository.revisionTitle"), { hash: hash.slice(0, 8) })}</h1>
        <Link href={basePath} className="underline text-sm">
          {translate(locale, "repository.back")}
        </Link>
      </div>
      {error ? null : (
        <RelatedIssues projectIdentifier={projectIdentifier} repositoryParam={repositoryParam ?? ""} context={context} revision={hash} />
      )}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <pre className="text-xs font-mono border rounded p-3 overflow-x-auto whitespace-pre">
          {diff?.split("\n").map((line, i) => (
            <div key={i} className={diffLineClassName(line)}>
              {line}
            </div>
          ))}
        </pre>
      )}
    </main>
  );
}
