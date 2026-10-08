import { activityEventPath } from "@/domain/activity/entity";
import { DrizzleJournalRepository } from "@/infrastructure/db/repositories/journal-repository";
import { listProjectActivityFeed } from "@/interface/http/project-activity-feed";
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

/** An issue the viewer may see, with what the blocks show of it. */
interface VisibleIssueEntry {
  issue: Issue;
  item: IssueBlockItem;
}

/** The issues among `issues` the viewer may see, judged project by project as the issue blocks do. */
async function visibleIssueEntries(user: User, issues: Issue[]): Promise<VisibleIssueEntry[]> {
  const projectRepository = new DrizzleProjectRepository();
  const access = new Map<string, { identifier: string; isVisible: (issue: Issue) => boolean }>();
  await Promise.all(
    [...new Set(issues.map((issue) => issue.projectId))].map(async (projectId) => {
      const project = await projectRepository.findById(projectId);
      if (!project) return;
      const { actor, userGroupIds } = await resolveActor(user, projectId);
      if (!can({ permission: "view_issues", project: toAuthorizationProject(project), actor })) return;
      access.set(projectId, { identifier: project.identifier, isVisible: visibleIssueFilter(user.id, actor, userGroupIds) });
    }),
  );
  const statusNameById = new Map((await new DrizzleIssueStatusRepository().listAll()).map((status) => [status.id, status.name]));
  return issues.flatMap((issue) => {
    const entry = access.get(issue.projectId);
    if (!entry || !entry.isVisible(issue)) return [];
    return [{ issue, item: { id: issue.id, subject: issue.subject, statusName: statusNameById.get(issue.statusId) ?? "?", projectIdentifier: entry.identifier } }];
  });
}

/** Redmine's issuesupdatedbyme block: the issues the viewer has journalled, most recently updated first. */
export async function loadUpdatedByMeBlock(user: User): Promise<IssueBlockItem[]> {
  const journaledIds = await new DrizzleJournalRepository().listIssueIdsJournaledBy(user.id);
  const issues = await new DrizzleIssueRepository().findByIds(journaledIds);
  return (await visibleIssueEntries(user, issues))
    .sort((a, b) => b.issue.updatedAt.getTime() - a.issue.updatedAt.getTime())
    .slice(0, 10)
    .map((entry) => entry.item);
}

export interface CalendarBlockItem extends IssueBlockItem {
  startDate: string | null;
  dueDate: string | null;
}

/** The Sunday-started week containing `today` (yyyy-mm-dd), as Redmine's week calendar uses it for the first-day-of-week setting "7". */
function weekBounds(today: string): { start: string; end: string } {
  const day = new Date(`${today}T00:00:00Z`);
  const start = new Date(day.getTime() - day.getUTCDay() * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Redmine's calendar block: the viewer's visible issues starting or due within the current week. */
export async function loadCalendarBlock(user: User, today: string): Promise<CalendarBlockItem[]> {
  const { start, end } = weekBounds(today);
  const inWeek = (date: string | null) => date !== null && date >= start && date <= end;
  const projects = await listVisibleProjects(user, "view_issues");
  const issueRepository = new DrizzleIssueRepository();
  const lists = await Promise.all(projects.map((project) => issueRepository.listByProject(project.id)));
  const issues = lists.flat().filter((issue) => inWeek(issue.startDate) || inWeek(issue.dueDate));
  return (await visibleIssueEntries(user, issues))
    .map((entry) => ({ ...entry.item, startDate: entry.issue.startDate, dueDate: entry.issue.dueDate }))
    .sort((a, b) => (a.startDate ?? a.dueDate ?? "").localeCompare(b.startDate ?? b.dueDate ?? ""));
}

export interface ActivityBlockItem {
  key: string;
  title: string;
  occurredAt: Date;
  href: string;
}

/**
 * Redmine's activity block: the viewer's own recent events across the projects they can see, newest first.
 * An event that a subproject's setting pulls into two project feeds is kept once.
 */
export async function loadActivityBlock(user: User, from: Date, to: Date): Promise<ActivityBlockItem[]> {
  const projects = await listVisibleProjects(user, "view_project");
  const feeds = await Promise.all(
    projects.map(async (project) => {
      const { actor, userGroupIds } = await resolveActor(user, project.id);
      return listProjectActivityFeed({ user, project, actor, userGroupIds, from, to });
    }),
  );
  const seen = new Set<string>();
  const items: ActivityBlockItem[] = [];
  for (const { event, identifier } of feeds.flat()) {
    const key = `${event.type}:${event.id}`;
    if (event.authorId !== user.id || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, title: event.title, occurredAt: event.occurredAt, href: activityEventPath(identifier, event) });
  }
  return items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 10);
}
