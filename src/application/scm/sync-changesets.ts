import { logTime, InvalidTimeEntryError } from "@/application/time-entries/log-time";
import { loadProjectActivities } from "@/application/time-entries/project-activities";
import type { ProjectActivityRepository } from "@/domain/enumeration/project-activity-repository";
import type { EnumerationRepository } from "@/domain/enumeration/repository";
import { StaleIssueError } from "@/domain/issue/entity";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { Changeset, Commit, ScmRepository } from "@/domain/scm/entity";
import { canReferenceIssueProject } from "@/domain/scm/issue-reference";
import { scanCommitMessage, type KeywordScanOptions } from "@/domain/scm/keyword-scan";
import type { ScmBrowser } from "@/domain/scm/scm-browser";
import { resolveCommitKeywordSettings } from "@/domain/settings/commit-keywords";
import type { SettingsRepository } from "@/domain/settings/repository";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import type { UserRepository } from "@/domain/user/repository";
import { resolveCommitterUser } from "./resolve-committer-user";

export interface SyncChangesetsRepositories {
  scmBrowser: ScmBrowser;
  changesetRepository: ChangesetRepository;
  issueRepository: IssueRepository;
  issueStatusRepository: IssueStatusRepository;
  timeEntryRepository: TimeEntryRepository;
  enumerationRepository: EnumerationRepository;
  projectActivityRepository: ProjectActivityRepository;
  userRepository: UserRepository;
  projectRepository: ProjectRepository;
  settingsRepository: SettingsRepository;
}

/**
 * Fallback used when no settings row exists yet (fresh install) — see
 * domain/settings/commit-keywords.ts, which is now the source of truth for the persisted,
 * admin-configurable version of these same values (mirrors Redmine's commit_ref_keywords /
 * commit_update_keywords). refKeywords matches Redmine's own out-of-the-box default;
 * fixKeywords hardcodes the "fixes,closes" rule Redmine's own documentation uses as its example
 * (vanilla Redmine actually ships commit_update_keywords empty by default, so this is slightly
 * more opinionated than a truly fresh Redmine install, but matches what nearly every real
 * deployment configures).
 */
export const DEFAULT_KEYWORD_SCAN_OPTIONS: KeywordScanOptions = resolveCommitKeywordSettings({}).keywordScanOptions;

export interface SyncChangesetsResult {
  ingested: number;
  fixed: number;
  timeLogged: number;
}

/** Redmine's find_referenced_issue_by_id: the issue, unless its project is out of the reference's reach. */
async function referenceableIssue(
  repositories: SyncChangesetsRepositories,
  issue: Issue,
  repositoryProject: Project,
  crossProjectRef: boolean,
): Promise<Issue | null> {
  if (issue.projectId === repositoryProject.id) return issue;
  const issueProject = await repositories.projectRepository.findById(issue.projectId);
  return issueProject && canReferenceIssueProject(repositoryProject, issueProject, crossProjectRef) ? issue : null;
}

/** Redmine's Changeset#committer: "Name <email>" when the SCM reports one, otherwise the bare name. */
function committerIdentityOf(commit: Commit): string {
  return commit.authorEmail ? `${commit.author} <${commit.authorEmail}>` : commit.author;
}

/** Mirrors Changeset#fix_issue: no-op on an already-closed issue; moves to the lowest-position closed status. */
async function applyFixAction(repositories: SyncChangesetsRepositories, issue: Issue): Promise<boolean> {
  const currentStatus = await repositories.issueStatusRepository.findById(issue.statusId);
  if (currentStatus?.isClosed) return false;

  const closedStatuses = (await repositories.issueStatusRepository.listAll())
    .filter((status) => status.isClosed)
    .sort((a, b) => a.position - b.position);
  const targetStatus = closedStatuses[0];
  if (!targetStatus) return false;

  try {
    await repositories.issueRepository.update(issue.id, issue.lockVersion, {
      statusId: targetStatus.id,
      doneRatio: targetStatus.defaultDoneRatio ?? issue.doneRatio,
    });
    return true;
  } catch (error) {
    // Mirrors fix_issue's "logger.warn(...) unless issue.save" — a losing race against a
    // concurrent edit shouldn't abort the rest of the sync.
    if (error instanceof StaleIssueError) return false;
    throw error;
  }
}

/**
 * Mirrors Changeset#log_time. The activity comes from the issue's project, not the system
 * list — Redmine's Project#commit_logtime_activity resolves the configured default over
 * `activities`, so a project that overrode or switched off that activity gets its own row
 * (or, if it switched it off entirely, no default to fall back on and no entry).
 */
async function applyTimeLog(
  repositories: SyncChangesetsRepositories,
  issue: Issue,
  changeset: Changeset,
  hours: number,
  userId: string,
): Promise<boolean> {
  const { offered } = await loadProjectActivities(repositories, issue.projectId);
  const activity = offered.find((a) => a.isDefault) ?? offered[0];
  if (!activity) return false;

  try {
    await logTime(
      {
        timeEntryRepository: repositories.timeEntryRepository,
        settingsRepository: repositories.settingsRepository,
        enumerationRepository: repositories.enumerationRepository,
        projectActivityRepository: repositories.projectActivityRepository,
      },
      {
        projectId: issue.projectId,
        issueId: issue.id,
        userId,
        authorId: userId,
        activityId: activity.id,
        hours,
        comments: `Applied in changeset ${changeset.revision.slice(0, 8)}.`,
        spentOn: changeset.committedOn.toISOString().slice(0, 10),
      },
    );
    return true;
  } catch (error) {
    if (error instanceof InvalidTimeEntryError) return false;
    throw error;
  }
}

/**
 * Ingests commits from `scmRepository`'s working copy as Changeset rows, and — mirroring
 * Changeset#scan_comment_for_issue_ids — scans each new commit's message for issue references,
 * applying a status-closing "fix" action and/or `@Nh` time logging where a keyword and matching
 * issue are found. Which issues a reference may reach follows Redmine's
 * `find_referenced_issue_by_id` — see domain/scm/issue-reference.ts.
 *
 * Idempotent: re-running against the same repository/ref only ingests commits not already
 * stored (by revision), so it's safe to call repeatedly (e.g. from a manual "sync" button)
 * rather than needing a stateful "last synced" cursor.
 */
export async function syncChangesets(
  repositories: SyncChangesetsRepositories,
  scmRepository: ScmRepository,
  ref: string,
  limit: number,
  keywordScanOptions: KeywordScanOptions = DEFAULT_KEYWORD_SCAN_OPTIONS,
  logtimeEnabled: boolean = true,
  crossProjectRef: boolean = false,
): Promise<SyncChangesetsResult> {
  const commits = await repositories.scmBrowser.log(scmRepository.rootPath, ref, limit);
  const repositoryProject = await repositories.projectRepository.findById(scmRepository.projectId);
  if (!repositoryProject) return { ingested: 0, fixed: 0, timeLogged: 0 };

  let ingested = 0;
  let fixed = 0;
  let timeLogged = 0;

  for (const commit of commits) {
    const existing = await repositories.changesetRepository.findByRevision(scmRepository.id, commit.hash);
    if (existing) continue;

    const committedOn = new Date(commit.date);
    const committerIdentity = committerIdentityOf(commit);
    // Resolved for every commit, including a historical import: the import cutoff below
    // suppresses the *actions* a commit message triggers, not who the commit belongs to.
    // Redmine does the same — before_create_cs assigns the user unconditionally, and only
    // scan_comment_for_issue_ids consults repository.created_on.
    const committerUser = await resolveCommitterUser(repositories, scmRepository.id, committerIdentity);
    const changeset = await repositories.changesetRepository.create({
      scmRepositoryId: scmRepository.id,
      revision: commit.hash,
      committerIdentity,
      userId: committerUser?.id ?? null,
      committedOn,
      comments: commit.message,
    });
    ingested++;

    const matches = scanCommitMessage(commit.message, keywordScanOptions);
    if (matches.length === 0) continue;

    // Mirrors the guard in scan_comment_for_issue_ids against replaying fix/time-log actions
    // when a repository's pre-existing history is first imported.
    const isHistoricalImport = committedOn < scmRepository.createdAt;

    const seenIssueIds = new Set<string>();
    for (const match of matches) {
      const candidates = await repositories.issueRepository.findByIdPrefix(match.issueIdPrefix);
      // Redmine resolves `#id` to exactly one issue and then applies the cross-project rule to
      // it; next-pm's shorthand is an id *prefix*, so an ambiguous one is dropped rather than
      // resolved arbitrarily.
      const issue = candidates.length === 1 ? await referenceableIssue(repositories, candidates[0], repositoryProject, crossProjectRef) : null;
      if (!issue || seenIssueIds.has(issue.id)) continue;
      seenIssueIds.add(issue.id);

      await repositories.changesetRepository.linkIssue(changeset.id, issue.id);
      if (isHistoricalImport) continue;

      if (match.action === "fix" && (await applyFixAction(repositories, issue))) {
        fixed++;
      }
      if (
        logtimeEnabled &&
        match.hours !== null &&
        committerUser &&
        (await applyTimeLog(repositories, issue, changeset, match.hours, committerUser.id))
      ) {
        timeLogged++;
      }
    }
  }

  return { ingested, fixed, timeLogged };
}
