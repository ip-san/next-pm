import type { ActivityEvent, ActivityEventGroup } from "@/domain/activity/entity";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { IssuesVisibility, TimeEntriesVisibility } from "@/domain/role/entity";
import { listProjectActivity, type ListProjectActivityRepositories } from "./list-project-activity";

/** One project's slice of the cross-project feed, with its actor already resolved by the caller. */
export interface GlobalActivityProject {
  projectId: string;
  projectIdentifier: string;
  projectName: string;
  projectContext: ProjectAuthorizationContext;
  actor: AuthorizationActor;
  userGroupIds: string[];
  issueVisibilityRoles: { issuesVisibility: IssuesVisibility }[];
  timeEntryVisibilityRoles: { timeEntriesVisibility: TimeEntriesVisibility }[];
}

/** An activity event that remembers which project it came from — the cross-project feed has to say. */
export interface GlobalActivityEvent extends ActivityEvent {
  projectIdentifier: string;
  projectName: string;
}

export interface ListGlobalActivityInput {
  projects: GlobalActivityProject[];
  /** Who is looking; feeds the private-issue and own-time-entry rules inside each project. */
  userId: string | null;
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** Event groups to keep. Omit for all permitted groups. */
  groups?: ActivityEventGroup[];
  /** Redmine's `params[:user_id]`: only events authored by this user. */
  authorId?: string | null;
  /** Cap on the merged result, applied after sorting — Redmine's `Fetcher#events(limit:)`. */
  limit?: number;
}

/**
 * `ActivitiesController#index` without a project. Deliberately a loop over
 * `listProjectActivity` rather than a second aggregation: every one of the eight event
 * types has its own `view_*` permission, and the private-issue and time-entry rules depend
 * on the viewer's roles *in that project*, so a merged query would have to rebuild all of
 * it. Running the per-project use case once per project keeps exactly one implementation
 * of those rules in the codebase.
 */
export async function listGlobalActivity(
  repositories: ListProjectActivityRepositories,
  input: ListGlobalActivityInput,
): Promise<GlobalActivityEvent[]> {
  const perProject = await Promise.all(
    input.projects.map(async (project) => {
      const events = await listProjectActivity(repositories, {
        projectId: project.projectId,
        projectContext: project.projectContext,
        actor: project.actor,
        userId: input.userId,
        userGroupIds: project.userGroupIds,
        issueVisibilityRoles: project.issueVisibilityRoles,
        timeEntryVisibilityRoles: project.timeEntryVisibilityRoles,
        from: input.from,
        to: input.to,
        groups: input.groups,
      });
      return events.map((event) => ({ ...event, projectIdentifier: project.projectIdentifier, projectName: project.projectName }));
    }),
  );

  const merged = perProject
    .flat()
    .filter((event) => (input.authorId ? event.authorId === input.authorId : true))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return input.limit === undefined ? merged : merged.slice(0, input.limit);
}
