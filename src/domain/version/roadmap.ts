import type { Version } from "./entity";
import { compareVersions } from "./sort";

/** An issue as the roadmap needs it: which version it is fixed to, and where it sorts in the list. */
export interface RoadmapIssue {
  id: string;
  number: number;
  projectId: string;
  trackerId: string;
  fixedVersionId: string | null;
  /** The issue's project lft, so issues group by project in nested-set order. */
  projectLft: number;
  /** The issue's tracker position within the project's trackers. */
  trackerPosition: number;
}

export interface RoadmapVersion<Issue extends RoadmapIssue> {
  version: Version;
  /** The visible issues of the roadmap trackers, listed under the version. */
  issues: Issue[];
  /** Every visible issue fixed to the version, whatever its tracker; the version's progress is computed from these. */
  progressIssues: Issue[];
}

export interface RoadmapSelectionInput<Issue extends RoadmapIssue> {
  /** Versions shared with the project (Version.shared_versions). */
  sharedVersions: Version[];
  /** Versions of the visible projects in the subtree, when with-subprojects applies; empty otherwise (rolled_up_versions). */
  rolledUpVersions: Version[];
  /** Projects whose own versions are always shown: the project, plus its subtree when with-subprojects applies. */
  scopeProjectIds: ReadonlySet<string>;
  /** Visible issues in the scope, of every tracker. */
  visibleIssues: Issue[];
  /** Trackers the roadmap lists: the project's trackers flagged is_in_roadmap. */
  roadmapTrackerIds: ReadonlySet<string>;
}

/**
 * Port of the version and issue selection in VersionsController#index. A version is kept when its project is
 * in scope, or when it has issues to list; the rest are shared versions with nothing to show here. Issues are
 * grouped under their version in project order, then tracker order, then number.
 */
export function selectRoadmapVersions<Issue extends RoadmapIssue>(input: RoadmapSelectionInput<Issue>): RoadmapVersion<Issue>[] {
  const versionById = new Map<string, Version>();
  for (const version of [...input.sharedVersions, ...input.rolledUpVersions]) {
    versionById.set(version.id, version);
  }

  const listedIssues = input.visibleIssues.filter((issue) => input.roadmapTrackerIds.has(issue.trackerId));
  const listedByVersion = groupByFixedVersion(listedIssues);
  const progressByVersion = groupByFixedVersion(input.visibleIssues);

  return [...versionById.values()]
    .filter((version) => input.scopeProjectIds.has(version.projectId) || (listedByVersion.get(version.id)?.length ?? 0) > 0)
    .sort(compareVersions)
    .map((version) => ({
      version,
      issues: sortIssues(listedByVersion.get(version.id) ?? []),
      progressIssues: sortIssues(progressByVersion.get(version.id) ?? []),
    }));
}

function groupByFixedVersion<Issue extends RoadmapIssue>(issues: Issue[]): Map<string, Issue[]> {
  const grouped = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (issue.fixedVersionId === null) continue;
    const bucket = grouped.get(issue.fixedVersionId);
    if (bucket) {
      bucket.push(issue);
    } else {
      grouped.set(issue.fixedVersionId, [issue]);
    }
  }
  return grouped;
}

function sortIssues<Issue extends RoadmapIssue>(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => a.projectLft - b.projectLft || a.trackerPosition - b.trackerPosition || a.number - b.number,
  );
}
