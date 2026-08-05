import { logTime, InvalidTimeEntryError } from "@/application/time-entries/log-time";
import type { EnumerationRepository } from "@/domain/enumeration/repository";
import { StaleIssueError } from "@/domain/issue/entity";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { Changeset, ScmRepository } from "@/domain/scm/entity";
import type { GitBrowser } from "@/domain/scm/git-browser";
import { scanCommitMessage, type KeywordScanOptions } from "@/domain/scm/keyword-scan";
import { resolveCommitKeywordSettings } from "@/domain/settings/commit-keywords";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import type { User } from "@/domain/user/entity";
import type { UserRepository } from "@/domain/user/repository";

export interface SyncChangesetsRepositories {
  gitBrowser: GitBrowser;
  changesetRepository: ChangesetRepository;
  issueRepository: IssueRepository;
  issueStatusRepository: IssueStatusRepository;
  timeEntryRepository: TimeEntryRepository;
  enumerationRepository: EnumerationRepository;
  userRepository: UserRepository;
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

async function resolveCommitterUser(userRepository: UserRepository, authorEmail: string): Promise<User | null> {
  if (!authorEmail) return null;
  return userRepository.findByMail(authorEmail);
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

/** Mirrors Changeset#log_time, using the system-wide default TimeEntryActivity (no per-project override yet). */
async function applyTimeLog(
  repositories: SyncChangesetsRepositories,
  issue: Issue,
  changeset: Changeset,
  hours: number,
  userId: string,
): Promise<boolean> {
  const activities = await repositories.enumerationRepository.listByType("TimeEntryActivity");
  const activity = activities.find((a) => a.isDefault) ?? activities[0];
  if (!activity) return false;

  try {
    await logTime(
      { timeEntryRepository: repositories.timeEntryRepository },
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
 * issue are found. Only issues in the SAME project as the repository are considered (a
 * simplification of Redmine's commit_cross_project_ref + parent/subproject tree walk).
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
): Promise<SyncChangesetsResult> {
  const commits = await repositories.gitBrowser.log(scmRepository.rootPath, ref, limit);

  let ingested = 0;
  let fixed = 0;
  let timeLogged = 0;

  for (const commit of commits) {
    const existing = await repositories.changesetRepository.findByRevision(scmRepository.id, commit.hash);
    if (existing) continue;

    const committedOn = new Date(commit.date);
    const changeset = await repositories.changesetRepository.create({
      scmRepositoryId: scmRepository.id,
      revision: commit.hash,
      committerIdentity: commit.authorEmail ? `${commit.author} <${commit.authorEmail}>` : commit.author,
      committedOn,
      comments: commit.message,
    });
    ingested++;

    const matches = scanCommitMessage(commit.message, keywordScanOptions);
    if (matches.length === 0) continue;

    // Mirrors the guard in scan_comment_for_issue_ids against replaying fix/time-log actions
    // when a repository's pre-existing history is first imported.
    const isHistoricalImport = committedOn < scmRepository.createdAt;
    const committerUser = isHistoricalImport ? null : await resolveCommitterUser(repositories.userRepository, commit.authorEmail);

    const seenIssueIds = new Set<string>();
    for (const match of matches) {
      const candidates = await repositories.issueRepository.findByIdPrefix(match.issueIdPrefix);
      const issue = candidates.find((candidate) => candidate.projectId === scmRepository.projectId);
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
