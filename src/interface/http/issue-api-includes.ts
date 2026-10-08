import { can } from "@/domain/authorization/authorization-service";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import type { Project } from "@/domain/project/entity";
import { allowedNewStatusIds } from "@/domain/workflow/transition-rules";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueRelationRepository } from "@/infrastructure/db/repositories/issue-relation-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { DrizzleWorkflowRepository } from "@/infrastructure/db/repositories/workflow-repository";
import { issueVisibilityCheck, listVisibleProjectContexts } from "@/interface/http/resolve-actor";
import type { User } from "@/domain/user/entity";

/** The `include=` values Redmine's show.api.rsb honours that next-pm can answer. */
export const ISSUE_INCLUDE_VALUES = ["children", "relations", "attachments", "watchers", "allowed_statuses"] as const;
export type IssueInclude = (typeof ISSUE_INCLUDE_VALUES)[number];

/** `include=a,b`: unknown names are ignored, as Redmine does. */
export function parseIssueIncludes(raw: string | null): Set<IssueInclude> {
  const requested = new Set((raw ?? "").split(",").map((name) => name.trim()));
  return new Set(ISSUE_INCLUDE_VALUES.filter((name) => requested.has(name)));
}

export interface IssueIncludeContext {
  issue: Issue;
  project: Project;
  projectContext: ProjectAuthorizationContext;
  actor: AuthorizationActor;
  roleIds: string[];
  userGroupIds: string[];
  user: User | null;
}

/**
 * The extra sections for `GET /api/v1/issues/:id?include=…`. Anything that points at another issue
 * (children, relations) is filtered with the same visibility the issue itself gets, so the response
 * can't reveal a private or unlisted issue through a link. Watchers need view_issue_watchers.
 */
export async function loadIssueIncludes(context: IssueIncludeContext, includes: Set<IssueInclude>) {
  const { issue, user } = context;
  const sections: Record<string, unknown> = {};
  if (includes.size === 0) return sections;

  const visibleTo = issueVisibilityCheck(user, await listVisibleProjectContexts(user, "view_issues"));

  if (includes.has("children")) {
    const children = await new DrizzleIssueRepository().listChildren(issue.id);
    sections.children = children
      .filter((child) => visibleTo(child))
      .map((child) => ({ id: child.id, subject: child.subject, trackerId: child.trackerId, statusId: child.statusId }));
  }

  if (includes.has("relations")) {
    const relations = await new DrizzleIssueRelationRepository().listForIssue(issue.id);
    const otherIds = relations.map((relation) => (relation.issueFromId === issue.id ? relation.issueToId : relation.issueFromId));
    const others = new Map((await new DrizzleIssueRepository().findByIds(otherIds)).map((other) => [other.id, other]));
    sections.relations = relations
      .filter((relation) => {
        const otherId = relation.issueFromId === issue.id ? relation.issueToId : relation.issueFromId;
        const other = others.get(otherId);
        return other !== undefined && visibleTo(other);
      })
      .map((relation) => ({
        id: relation.id,
        issueFromId: relation.issueFromId,
        issueToId: relation.issueToId,
        relationType: relation.relationType,
        delay: relation.delay,
      }));
  }

  if (includes.has("attachments")) {
    const attachments = await new DrizzleAttachmentRepository().listByContainer("Issue", issue.id);
    sections.attachments = attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      filesize: attachment.fileSize,
      contentType: attachment.contentType,
      description: attachment.description,
      authorId: attachment.authorId,
      createdAt: attachment.createdAt,
    }));
  }

  if (includes.has("watchers") && can({ permission: "view_issue_watchers", project: context.projectContext, actor: context.actor })) {
    const watcherIds = await new DrizzleWatcherRepository().listWatcherUserIds("Issue", issue.id);
    const watchers = await new DrizzleUserRepository().findByIds(watcherIds);
    sections.watchers = watchers.map((watcher) => ({ id: watcher.id, name: `${watcher.lastname} ${watcher.firstname}` }));
  }

  if (includes.has("allowed_statuses")) {
    const [transitions, statuses] = await Promise.all([
      new DrizzleWorkflowRepository().listForTracker(issue.trackerId),
      new DrizzleIssueStatusRepository().listAll(),
    ]);
    const isAuthor = issue.authorId === user?.id;
    const isAssignee =
      issue.assignedToType === "group"
        ? issue.assignedToId !== null && context.userGroupIds.includes(issue.assignedToId)
        : issue.assignedToId !== null && issue.assignedToId === user?.id;
    const allowedIds = new Set(
      allowedNewStatusIds(transitions, {
        trackerId: issue.trackerId,
        roleIds: context.roleIds,
        currentStatusId: issue.statusId,
        isAuthor,
        isAssignee,
      }),
    );
    sections.allowedStatuses = statuses
      .filter((status) => allowedIds.has(status.id))
      .map((status) => ({ id: status.id, name: status.name, isClosed: status.isClosed }));
  }

  return sections;
}
