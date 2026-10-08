import type { ActivityEvent, ActivityEventGroup } from "@/domain/activity/entity";
import { can } from "@/domain/authorization/authorization-service";
import type { AuthorizationActor, ProjectAuthorizationContext } from "@/domain/authorization/authorization-service";
import type { DocumentRepository } from "@/domain/document/repository";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { describeJournalDetail, summariseJournalDetail, type JournalDetailNames } from "@/domain/journal/detail-label";
import type { IssueRepository } from "@/domain/issue/repository";
import type { JournalRepository } from "@/domain/journal/repository";
import type { MessageRepository } from "@/domain/message/repository";
import type { NewsRepository } from "@/domain/news/repository";
import type { IssuesVisibility, TimeEntriesVisibility } from "@/domain/role/entity";
import { isTimeEntryVisible } from "@/domain/time-entry/visibility";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";
import type { TimeEntryRepository } from "@/domain/time-entry/repository";
import type { WikiContentRepository } from "@/domain/wiki/repository";

export interface ListProjectActivityRepositories {
  issueRepository: IssueRepository;
  journalRepository: JournalRepository;
  newsRepository: NewsRepository;
  messageRepository: MessageRepository;
  wikiContentRepository: WikiContentRepository;
  documentRepository: DocumentRepository;
  timeEntryRepository: TimeEntryRepository;
  scmRepositoryRepository: ScmRepositoryRepository;
  changesetRepository: ChangesetRepository;
}

/** The feed resolves no ids — see the excerpt fallback below for why. */
const EMPTY_DETAIL_NAMES: JournalDetailNames = { customFields: new Map(), values: new Map() };

export interface ListProjectActivityInput {
  projectId: string;
  projectContext: ProjectAuthorizationContext;
  actor: AuthorizationActor;
  userId: string | null;
  userGroupIds: string[];
  issueVisibilityRoles: { issuesVisibility: IssuesVisibility }[];
  /** The actor's roles for the time-entry side of visibility — "own" hides other people's logged time. */
  timeEntryVisibilityRoles: { timeEntriesVisibility: TimeEntriesVisibility }[];
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** When provided, restricts to these groups (still intersected with the actor's own permissions). Omit for "all permitted groups". */
  groups?: ActivityEventGroup[];
}

function inRange(date: Date, from: Date, to: Date): boolean {
  return date >= from && date < to;
}

/**
 * Aggregates events across every module with its own permission gate, mirroring
 * `searchProject`'s per-type authorization loop — each Redmine `acts_as_activity_provider`
 * has a distinct `view_*` permission, so one merged query would either over- or under-share.
 * A journal only counts as an "issue" event when it carries a note or a status change,
 * matching Journal's own activity scope (a bare custom-field-only edit stays silent).
 */
export async function listProjectActivity(
  repositories: ListProjectActivityRepositories,
  input: ListProjectActivityInput,
): Promise<ActivityEvent[]> {
  const wantsGroup = (group: ActivityEventGroup): boolean => !input.groups || input.groups.includes(group);
  const events: ActivityEvent[] = [];

  if (wantsGroup("issue") && can({ permission: "view_issues", project: input.projectContext, actor: input.actor })) {
    const issues = await repositories.issueRepository.listByProject(input.projectId);
    const visibleIssues = issues.filter((issue) => isPrivateIssueVisible(issue, input.userId, input.userGroupIds, input.issueVisibilityRoles));
    const issueById = new Map(visibleIssues.map((issue) => [issue.id, issue]));

    for (const issue of visibleIssues) {
      if (inRange(issue.createdAt, input.from, input.to)) {
        events.push({ type: "issue_created", id: issue.id, authorId: issue.authorId, title: issue.subject, excerpt: issue.description, occurredAt: issue.createdAt });
      }
    }

    // The viewer is derived here rather than passed in, so both the activity page and the
    // Atom feed get private-note filtering without either having to remember it.
    const journals = await repositories.journalRepository.listByProject(input.projectId, {
      userId: input.userId,
      canViewPrivateNotes: can({ permission: "view_private_notes", project: input.projectContext, actor: input.actor }),
    });
    for (const journal of journals) {
      const issue = issueById.get(journal.journalizedId);
      if (!issue) continue; // belongs to an issue the actor can't see, or outside this project
      if (!inRange(journal.createdAt, input.from, input.to)) continue;
      const hasStatusChange = journal.details.some((detail) => detail.fieldName === "statusId");
      if (journal.notes.trim().length === 0 && !hasStatusChange) continue;
      // An attribute-only journal has no note, which left the feed showing a dated entry
      // with no description at all. Fall back to the same readable rendering the issue
      // history uses. Ids are left unresolved here on purpose: the feed has no per-viewer
      // name map, and resolving blind would leak a private project's or issue's name — so
      // describeJournalDetail prints a short id instead.
      const excerpt =
        journal.notes.trim().length > 0
          ? journal.notes
          : journal.details
              .map((detail) => summariseJournalDetail(describeJournalDetail(detail, EMPTY_DETAIL_NAMES)))
              .join(" / ");
      events.push({ type: "issue_updated", id: issue.id, authorId: journal.userId, title: issue.subject, excerpt, occurredAt: journal.createdAt });
    }
  }

  if (wantsGroup("news") && can({ permission: "view_news", project: input.projectContext, actor: input.actor })) {
    const newsItems = await repositories.newsRepository.listByProject(input.projectId);
    for (const item of newsItems) {
      if (inRange(item.createdAt, input.from, input.to)) {
        events.push({ type: "news", id: item.id, authorId: item.authorId, title: item.title, excerpt: item.description, occurredAt: item.createdAt });
      }
    }
  }

  if (wantsGroup("message") && can({ permission: "view_messages", project: input.projectContext, actor: input.actor })) {
    const messages = await repositories.messageRepository.listByProject(input.projectId);
    for (const message of messages) {
      if (inRange(message.createdAt, input.from, input.to)) {
        events.push({ type: "message", id: message.id, authorId: message.authorId, title: message.subject, excerpt: message.content, occurredAt: message.createdAt });
      }
    }
  }

  // WikiContentVersion's acts_as_activity_provider declares :permission => :view_wiki_edits
  // (wiki_content_version.rb#L42), not view_wiki_pages — the feed exposes edit history.
  if (wantsGroup("wiki_edit") && can({ permission: "view_wiki_edits", project: input.projectContext, actor: input.actor })) {
    const versions = await repositories.wikiContentRepository.listByProject(input.projectId);
    for (const { page, version } of versions) {
      if (inRange(version.createdAt, input.from, input.to)) {
        events.push({
          type: "wiki_edit",
          id: page.title,
          authorId: version.authorId,
          title: `${page.title} (#${version.version})`,
          excerpt: version.comments,
          occurredAt: version.createdAt,
        });
      }
    }
  }

  if (wantsGroup("document") && can({ permission: "view_documents", project: input.projectContext, actor: input.actor })) {
    const documents = await repositories.documentRepository.listByProject(input.projectId);
    for (const document of documents) {
      if (inRange(document.createdAt, input.from, input.to)) {
        events.push({ type: "document", id: document.id, authorId: null, title: document.title, excerpt: document.description, occurredAt: document.createdAt });
      }
    }
  }

  if (wantsGroup("time_entry") && can({ permission: "view_time_entries", project: input.projectContext, actor: input.actor })) {
    const entries = await repositories.timeEntryRepository.listForProject(input.projectId);
    // Same two narrowings as the time-entries page: a role with time_entries_visibility ==
    // "own" only ever sees its own rows, and an entry against a private issue the viewer
    // can't see must not leak that issue's subject — or even that time was logged on it.
    const linkedIssueIds = [...new Set(entries.map((entry) => entry.issueId).filter((id): id is string => id !== null))];
    const linkedIssues = await Promise.all(linkedIssueIds.map((id) => repositories.issueRepository.findById(id)));
    const linkedIssueById = new Map(linkedIssues.filter((issue) => issue !== null).map((issue) => [issue.id, issue]));

    for (const entry of entries) {
      if (!inRange(entry.createdAt, input.from, input.to)) continue;
      if (!isTimeEntryVisible(entry, input.userId, input.timeEntryVisibilityRoles)) continue;
      const linkedIssue = entry.issueId ? linkedIssueById.get(entry.issueId) : undefined;
      if (entry.issueId && linkedIssue && !isPrivateIssueVisible(linkedIssue, input.userId, input.userGroupIds, input.issueVisibilityRoles)) continue;
      events.push({ type: "time_entry", id: entry.id, authorId: entry.userId, title: `${entry.hours}h`, excerpt: entry.comments, occurredAt: entry.createdAt });
    }
  }

  if (wantsGroup("changeset") && can({ permission: "view_changesets", project: input.projectContext, actor: input.actor })) {
    // Every repository of the project, not only the default one. Redmine's `Project#changesets`
    // goes through `has_one :repository` and therefore only covers the default, but its
    // activity provider doesn't use that association — `Changeset.visible` joins repositories
    // to the project, so a commit in a secondary repository still shows up.
    const scmRepositories = await repositories.scmRepositoryRepository.listByProject(input.projectId);
    for (const scmRepository of scmRepositories) {
      const changesets = await repositories.changesetRepository.listByScmRepository(scmRepository.id);
      for (const changeset of changesets) {
        if (!inRange(changeset.committedOn, input.from, input.to)) continue;
        events.push({
          type: "changeset",
          // Unique across repositories: two of a project's repositories can legitimately hold
          // the same revision string (a fork, or the same backend registered twice).
          id: `${scmRepository.id}:${changeset.revision}`,
          // The committer's mapped user, when there is one — Redmine's activity view shows
          // Changeset#author, which is the mapped user falling back to the raw committer name
          // (still rendered in the excerpt below for the unmapped case).
          authorId: changeset.userId,
          title: changeset.comments.split("\n")[0] || changeset.revision.slice(0, 8),
          excerpt: `${changeset.committerIdentity} — ${changeset.revision.slice(0, 8)}`,
          occurredAt: changeset.committedOn,
        });
      }
    }
  }

  return events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
