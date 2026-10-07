import type { EnumerationRepository } from "@/domain/enumeration/repository";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import { recalculateParentAttributes, type RollupChild } from "@/domain/issue/rollup";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import { resolveGeneralSettings } from "@/domain/settings/general-settings";
import type { SettingsRepository } from "@/domain/settings/repository";

export interface RecalculateParentsRepositories {
  issueRepository: IssueRepository;
  issueStatusRepository: IssueStatusRepository;
  enumerationRepository: EnumerationRepository;
  settingsRepository: SettingsRepository;
}

/**
 * Walks up from `issueId` re-deriving each ancestor's rolled-up attributes, the way
 * Redmine's `recalculate_attributes_for` recurses ("ancestors will be recursively updated").
 *
 * Writes straight through the repository rather than through `updateIssue`: Redmine calls
 * `p.save(validate: false)` with no `init_journal`, so a parent moving because a child
 * changed is not a journalled edit, is not subject to workflow field permissions, and must
 * not fail on a validation the parent itself can't satisfy. `startIssueId` is included in
 * the walk's starting point only as a child — it is never recalculated from itself.
 */
export async function recalculateParents(
  repositories: RecalculateParentsRepositories,
  startIssueId: string,
  /** Extra ancestors to refresh — e.g. the parent an issue just moved away from. */
  alsoRecalculate: (string | null)[] = [],
): Promise<void> {
  const settings = resolveGeneralSettings(await repositories.settingsRepository.getAll());
  const options = {
    dates: settings.parentIssueDates === "derived",
    priority: settings.parentIssuePriority === "derived",
    doneRatio: settings.parentIssueDoneRatio === "derived",
  };
  if (!options.dates && !options.priority && !options.doneRatio) return;

  const start = await repositories.issueRepository.findById(startIssueId);
  const seeds = [...new Set([start?.parentId, ...alsoRecalculate].flatMap((id) => (id ? [id] : [])))];
  if (seeds.length === 0) return;

  const projectIssues = await repositories.issueRepository.listByProject(
    start?.projectId ?? (await repositories.issueRepository.findById(seeds[0]))?.projectId ?? "",
  );
  const byId = new Map(projectIssues.map((issue) => [issue.id, issue]));
  const childrenByParent = new Map<string, Issue[]>();
  for (const issue of projectIssues) {
    if (!issue.parentId) continue;
    childrenByParent.set(issue.parentId, [...(childrenByParent.get(issue.parentId) ?? []), issue]);
  }

  const [statuses, priorities] = await Promise.all([
    repositories.issueStatusRepository.listAll(),
    repositories.enumerationRepository.listByType("IssuePriority"),
  ]);
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const priorityById = new Map(priorities.map((priority) => [priority.id, priority]));
  const defaultPriorityId = priorities.find((priority) => priority.isDefault)?.id ?? null;

  const visited = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    // A cycle in stored data, or a diamond reached twice, must not spin here — the same
    // guard the rest of the parent-chain walks in this codebase use.
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    const parent = byId.get(parentId);
    if (!parent) continue;
    const children = childrenByParent.get(parentId) ?? [];
    if (children.length === 0) continue;

    const parentStatus = statusById.get(parent.statusId);
    const changes = recalculateParentAttributes(
      // Re-read each child from `byId`: walking upwards means a child may itself have just
      // been recalculated in an earlier pass, and the stale copy in `childrenByParent`
      // would roll the pre-update value into its grandparent.
      children.map((child) => toRollupChild(byId.get(child.id) ?? child, byId, childrenByParent, statusById, priorityById)),
      {
        ...options,
        doneRatioFixedByStatus: settings.issueDoneRatio === "issue_status" && parentStatus?.defaultDoneRatio != null,
        defaultPriorityId,
      },
    );

    const applied = onlyChanged(parent, changes);
    if (Object.keys(applied).length > 0) {
      const updated = await repositories.issueRepository.update(parent.id, parent.lockVersion, applied);
      byId.set(updated.id, updated);
    }

    if (parent.parentId) queue.push(parent.parentId);
  }
}

function toRollupChild(
  child: Issue,
  byId: Map<string, Issue>,
  childrenByParent: Map<string, Issue[]>,
  statusById: Map<string, { isClosed: boolean }>,
  priorityById: Map<string, { position: number }>,
): RollupChild {
  return {
    startDate: child.startDate,
    dueDate: child.dueDate,
    doneRatio: child.doneRatio,
    totalEstimatedHours: totalEstimatedHours(child, byId, childrenByParent),
    isClosed: statusById.get(child.statusId)?.isClosed ?? false,
    priorityPosition: priorityById.get(child.priorityId)?.position ?? 0,
    priorityId: child.priorityId,
  };
}

/** Redmine's `total_estimated_hours`: the issue's own estimate plus every descendant's. */
function totalEstimatedHours(issue: Issue, byId: Map<string, Issue>, childrenByParent: Map<string, Issue[]>): number {
  let total = (byId.get(issue.id) ?? issue).estimatedHours ?? 0;
  const queue = [...(childrenByParent.get(issue.id) ?? [])];
  const seen = new Set<string>([issue.id]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    total += byId.get(current.id)?.estimatedHours ?? 0;
    queue.push(...(childrenByParent.get(current.id) ?? []));
  }
  return total;
}

/** Keeps the write (and the lock_version bump) to attributes that actually moved. */
function onlyChanged(parent: Issue, changes: ReturnType<typeof recalculateParentAttributes>) {
  const applied: typeof changes = {};
  if (changes.startDate !== undefined && changes.startDate !== parent.startDate) applied.startDate = changes.startDate;
  if (changes.dueDate !== undefined && changes.dueDate !== parent.dueDate) applied.dueDate = changes.dueDate;
  if (changes.priorityId !== undefined && changes.priorityId !== parent.priorityId) applied.priorityId = changes.priorityId;
  if (changes.doneRatio !== undefined && changes.doneRatio !== parent.doneRatio) applied.doneRatio = changes.doneRatio;
  return applied;
}
