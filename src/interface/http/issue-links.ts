import { can } from "@/domain/authorization/authorization-service";
import type { IssueLink } from "@/domain/formatting/issue-references";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { User } from "@/domain/user/entity";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

/**
 * The links for the `#N` references in a text, for this viewer. An issue gets a link, and its subject as the hover
 * title, only when the viewer may see it: view_issues on its project and the private-issue rule. Any other number
 * gets no link, so the text shows the bare `#N` and nothing about the issue.
 */
export async function resolveIssueLinks(user: User | null, numbers: number[]): Promise<Map<number, IssueLink>> {
  const issueRepository = new DrizzleIssueRepository();
  const projectRepository = new DrizzleProjectRepository();
  const links = new Map<number, IssueLink>();
  for (const number of numbers) {
    const issue = await issueRepository.findByNumber(number);
    if (!issue) continue;
    const project = await projectRepository.findById(issue.projectId);
    if (!project) continue;
    const { actor, userGroupIds } = await resolveActor(user, project.id);
    if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) continue;
    if (!isPrivateIssueVisible(issue, user?.id ?? null, userGroupIds, issuesVisibilityRoles(actor))) continue;
    links.set(number, { href: `/projects/${project.identifier}/issues/${issue.id}`, title: issue.subject });
  }
  return links;
}
