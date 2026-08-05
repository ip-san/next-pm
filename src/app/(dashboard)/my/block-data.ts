import { can } from "@/domain/authorization/authorization-service";
import type { PermissionKey } from "@/domain/authorization/permission-registry";
import type { Issue } from "@/domain/issue/entity";
import type { Project } from "@/domain/project/entity";
import type { User } from "@/domain/user/entity";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleGroupRepository } from "@/infrastructure/db/repositories/group-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleNewsRepository } from "@/infrastructure/db/repositories/news-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleWatcherRepository } from "@/infrastructure/db/repositories/watcher-repository";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";

export interface IssueBlockItem {
  id: string;
  subject: string;
  statusName: string;
  projectIdentifier: string;
}

export interface IssueBlocks {
  assigned: IssueBlockItem[];
  reported: IssueBlockItem[];
  watched: IssueBlockItem[];
}

/** One shared visible-project resolution pass feeds all three issue blocks — mirrors the original (pre-blocks) My Page's approach. */
export async function loadIssueBlocks(user: User): Promise<IssueBlocks> {
  const issueRepository = new DrizzleIssueRepository();
  const userGroupIds = await new DrizzleGroupRepository().listGroupIdsForUser(user.id);
  const [assigned, reported, watchedIds] = await Promise.all([
    issueRepository.findByAssignee(user.id, userGroupIds),
    issueRepository.findByAuthor(user.id),
    new DrizzleWatcherRepository().listWatchedIds("Issue", user.id),
  ]);
  const watched = await issueRepository.findByIds(watchedIds);

  const projectIds = new Set([...assigned, ...reported, ...watched].map((issue) => issue.projectId));
  const projectRepository = new DrizzleProjectRepository();
  const visibleProjectIds = new Set<string>();
  const projectIdentifierById = new Map<string, string>();
  const issueFilters = new Map<string, (issue: Issue) => boolean>();
  await Promise.all(
    [...projectIds].map(async (projectId) => {
      const project = await projectRepository.findById(projectId);
      if (!project) return;
      const { actor, userGroupIds: actorGroupIds } = await resolveActor(user, projectId);
      if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) return;
      visibleProjectIds.add(projectId);
      projectIdentifierById.set(projectId, project.identifier);
      issueFilters.set(projectId, visibleIssueFilter(user.id, actor, actorGroupIds));
    }),
  );

  const statuses = await new DrizzleIssueStatusRepository().listAll();
  const statusNameById = new Map(statuses.map((s) => [s.id, s.name]));

  function toItems(issues: Issue[]): IssueBlockItem[] {
    return issues
      .filter((issue) => visibleProjectIds.has(issue.projectId) && (issueFilters.get(issue.projectId)?.(issue) ?? false))
      .map((issue) => ({
        id: issue.id,
        subject: issue.subject,
        statusName: statusNameById.get(issue.statusId) ?? "?",
        projectIdentifier: projectIdentifierById.get(issue.projectId) ?? "",
      }));
  }

  return { assigned: toItems(assigned), reported: toItems(reported), watched: toItems(watched) };
}

/** Every non-archived project where `user` holds `permission` — the cross-project visibility next-pm otherwise never needed until My Page grew blocks that aren't scoped to one project. */
async function listVisibleProjects(user: User, permission: PermissionKey): Promise<Project[]> {
  const projects = await new DrizzleProjectRepository().listAll();
  const visible: Project[] = [];
  for (const project of projects) {
    if (project.status === "archived") continue;
    const { actor } = await resolveActor(user, project.id);
    if (can({ permission, project: toAuthorizationProject(project), actor })) {
      visible.push(project);
    }
  }
  return visible;
}

export interface NewsBlockItem {
  id: string;
  title: string;
  projectIdentifier: string;
  createdAt: Date;
}

export async function loadNewsBlock(user: User): Promise<NewsBlockItem[]> {
  const projects = await listVisibleProjects(user, "view_news");
  const projectIdentifierById = new Map(projects.map((p) => [p.id, p.identifier]));
  const newsRepository = new DrizzleNewsRepository();
  const lists = await Promise.all(projects.map((p) => newsRepository.listByProject(p.id)));
  return lists
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((item) => ({ id: item.id, title: item.title, projectIdentifier: projectIdentifierById.get(item.projectId) ?? "", createdAt: item.createdAt }));
}

export interface DocumentBlockItem {
  id: string;
  title: string;
  projectIdentifier: string;
  createdAt: Date;
}

export async function loadDocumentsBlock(user: User): Promise<DocumentBlockItem[]> {
  const projects = await listVisibleProjects(user, "view_documents");
  const projectIdentifierById = new Map(projects.map((p) => [p.id, p.identifier]));
  const documentRepository = new DrizzleDocumentRepository();
  const lists = await Promise.all(projects.map((p) => documentRepository.listByProject(p.id)));
  return lists
    .flat()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((item) => ({ id: item.id, title: item.title, projectIdentifier: projectIdentifierById.get(item.projectId) ?? "", createdAt: item.createdAt }));
}

export interface TimelogBlockItem {
  id: string;
  hours: number;
  comments: string;
  spentOn: string;
  projectIdentifier: string;
}

/** Mirrors Redmine's timelog block: the *current user's own* logged time, not everyone's, across every project they can still see. */
export async function loadTimelogBlock(user: User, days: number): Promise<TimelogBlockItem[]> {
  const projects = await listVisibleProjects(user, "view_time_entries");
  const projectIdentifierById = new Map(projects.map((p) => [p.id, p.identifier]));
  const timeEntryRepository = new DrizzleTimeEntryRepository();
  const lists = await Promise.all(projects.map((p) => timeEntryRepository.listForProject(p.id)));

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffDateString = cutoff.toISOString().slice(0, 10);

  return lists
    .flat()
    .filter((entry) => entry.userId === user.id && entry.spentOn >= cutoffDateString)
    .sort((a, b) => b.spentOn.localeCompare(a.spentOn))
    .map((entry) => ({
      id: entry.id,
      hours: entry.hours,
      comments: entry.comments,
      spentOn: entry.spentOn,
      projectIdentifier: projectIdentifierById.get(entry.projectId) ?? "",
    }));
}
