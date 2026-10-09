import type { Issue } from "@/domain/issue/entity";
import type { AtomFeedEntry } from "@/domain/atom/build-feed";
import type { IssueListLookups } from "@/interface/query/issue-list-view";

/**
 * One issue as a feed entry, mirroring `Issue`'s `acts_as_event` in Redmine's issue.rb:
 * the title is `"#{tracker} ##{id} (#{status}): #{subject}"` and the summary is the
 * description. `render_feed` re-sorts items by `event_datetime`, which `acts_as_event`
 * leaves at `created_on` for an issue, so a feed is always "newest issues first" however
 * the query itself was sorted.
 */
export function issueFeedEntries(
  issues: Issue[],
  lookups: Pick<IssueListLookups, "trackers" | "statuses" | "users">,
  origin: string,
  pathFor: (issue: Issue) => string,
): AtomFeedEntry[] {
  return [...issues]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((issue) => {
      const link = `${origin}${pathFor(issue)}`;
      return {
        id: link,
        title: `${lookups.trackers.get(issue.trackerId) ?? ""} #${issue.number} (${lookups.statuses.get(issue.statusId) ?? ""}): ${issue.subject}`,
        link,
        updatedAt: issue.createdAt,
        authorName: lookups.users.get(issue.authorId) ?? null,
        summary: issue.description,
      };
    });
}
