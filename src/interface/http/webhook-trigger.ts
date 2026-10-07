import { can } from "@/domain/authorization/authorization-service";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { Issue } from "@/domain/issue/entity";
import type { Project } from "@/domain/project/entity";
import type { WebhookEvent } from "@/domain/webhook/events";
import { triggerWebhooks } from "@/application/webhooks/trigger-webhooks";
import { loadGeneralSettings } from "@/application/settings/general-settings";
import { DrizzleJobRepository } from "@/infrastructure/db/repositories/job-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleWebhookRepository } from "@/infrastructure/db/repositories/webhook-repository";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "./resolve-actor";

/**
 * The interface-layer entry point for `Webhook.trigger`. It sits here, next to the
 * `enqueueNotification` calls, for the same reason those do: firing a hook needs `can()` and
 * the visibility rules, which this codebase keeps out of the application layer.
 *
 * Nothing here is allowed to fail a request. A webhook is an after-the-fact side effect of a
 * change that has already been committed, so an unreachable database row or a malformed hook
 * costs a delivery, never the user's action.
 */
async function triggerIfEnabled(
  event: WebhookEvent,
  project: Project,
  data: Record<string, unknown>,
  timestamp: Date,
  isVisibleTo: (userId: string) => Promise<boolean>,
): Promise<void> {
  try {
    const { webhooksEnabled } = await loadGeneralSettings(new DrizzleSettingsRepository());
    if (!webhooksEnabled) return;

    const projectContext = toAuthorizationProject(project);
    await triggerWebhooks(
      { webhookRepository: new DrizzleWebhookRepository(), jobRepository: new DrizzleJobRepository() },
      {
        event,
        projectId: project.id,
        timestamp,
        data,
        isDeliverableTo: async (userId) => {
          const owner = await new DrizzleUserRepository().findById(userId);
          if (!owner || owner.status !== "active") return false;
          const { actor } = await resolveActor(owner, project.id);
          // Re-checked per delivery, not only when the hook was saved: a role change must
          // stop an existing hook, exactly as Redmine re-evaluates allowed_to? in hooks_for.
          if (!can({ permission: "use_webhooks", project: projectContext, actor })) return false;
          return isVisibleTo(userId);
        },
      },
    );
  } catch {
    // Swallowed on purpose — see the comment above.
  }
}

export async function triggerIssueWebhook(
  event: "issue.created" | "issue.updated",
  project: Project,
  issue: Issue,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // Redmine stamps a created event with created_on and an updated one with the journal's
  // created_on; without the journal in hand, updated_on is the same instant.
  const timestamp = event === "issue.created" ? issue.createdAt : issue.updatedAt;
  await triggerIfEnabled(event, project, { issue, ...extra }, timestamp, async (userId) => {
    const owner = await new DrizzleUserRepository().findById(userId);
    if (!owner) return false;
    const { actor, userGroupIds } = await resolveActor(owner, project.id);
    if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) return false;
    return isPrivateIssueVisible(issue, userId, userGroupIds, issuesVisibilityRoles(actor));
  });
}

export async function triggerNewsWebhook(
  project: Project,
  news: { id: string; createdAt: Date },
): Promise<void> {
  await triggerIfEnabled("news.created", project, { news }, news.createdAt, async (userId) => {
    const owner = await new DrizzleUserRepository().findById(userId);
    if (!owner) return false;
    const { actor } = await resolveActor(owner, project.id);
    return can({ permission: "view_news", project: toAuthorizationProject(project), actor });
  });
}

export async function triggerWikiPageWebhook(
  project: Project,
  page: Record<string, unknown>,
): Promise<void> {
  await triggerIfEnabled("wiki_page.updated", project, { wiki_page: page }, new Date(), async (userId) => {
    const owner = await new DrizzleUserRepository().findById(userId);
    if (!owner) return false;
    const { actor } = await resolveActor(owner, project.id);
    return can({ permission: "view_wiki_pages", project: toAuthorizationProject(project), actor });
  });
}
