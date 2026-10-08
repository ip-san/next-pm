/** Mirrors Redmine::MyPage::CORE_GROUPS — the three fixed columns a block can sit in. */
export const MY_PAGE_GROUPS = ["top", "left", "right"] as const;
export type MyPageGroup = (typeof MY_PAGE_GROUPS)[number];

/**
 * A subset of Redmine::MyPage::CORE_BLOCKS: the ones next-pm already has the underlying data
 * access for (issue lists, news, documents, time entries). Deliberately left out: `calendar` and
 * `activity` (Redmine's own versions are per-project; a cross-project My Page block would need
 * new aggregation beyond what this pass covers), `issuequery` (repeatable, needs a picker UI for
 * choosing which saved query — a real feature in its own right), and `issuesupdatedbyme` (no
 * existing "issues I updated" query to reuse). None of the blocks kept here are repeatable, so
 * unlike Redmine (which suffixes repeat instances as "issuequery__2"), a block id is always
 * exactly one instance — simpler, and enough for every block below.
 */
export const MY_PAGE_BLOCK_TYPES = [
  "issues_assigned_to_me",
  "issues_reported_by_me",
  "issues_updated_by_me",
  "issues_watched",
  "calendar",
  "news",
  "documents",
  "timelog",
  "activity",
] as const;
/**
 * Redmine's `issuequery` block: shows a saved issue query, and up to three of them can sit on a page
 * (`issuequery`, then `issuequery__1` and `issuequery__2`, as Redmine's block_options numbers them).
 */
export const ISSUE_QUERY_BLOCK_IDS = ["issuequery", "issuequery__1", "issuequery__2"] as const;
export type IssueQueryBlock = (typeof ISSUE_QUERY_BLOCK_IDS)[number];

export type StaticMyPageBlockType = (typeof MY_PAGE_BLOCK_TYPES)[number];
export type MyPageBlockType = StaticMyPageBlockType | IssueQueryBlock;

export function isIssueQueryBlock(block: string): block is IssueQueryBlock {
  return (ISSUE_QUERY_BLOCK_IDS as readonly string[]).includes(block);
}

export function isMyPageBlockType(block: string): block is MyPageBlockType {
  return (MY_PAGE_BLOCK_TYPES as readonly string[]).includes(block) || isIssueQueryBlock(block);
}

/** The id a new issue-query block takes: the first of the three not already on the page; null when all are placed. */
export function nextIssueQueryBlockId(placed: readonly string[]): IssueQueryBlock | null {
  return ISSUE_QUERY_BLOCK_IDS.find((id) => !placed.includes(id)) ?? null;
}

export type MyPageLayout = Record<MyPageGroup, MyPageBlockType[]>;

/** Mirrors Redmine::MyPage.default_layout, adapted to the block set above. */
export const DEFAULT_MY_PAGE_LAYOUT: MyPageLayout = {
  top: [],
  left: ["issues_assigned_to_me", "issues_watched"],
  right: ["issues_reported_by_me"],
};

/** The only per-block setting kept in this pass — mirrors Redmine's timelog block's `days` setting (default 7, its own default). */
export interface TimelogBlockSettings {
  days: number;
}

export const DEFAULT_TIMELOG_DAYS = 7;
export const MIN_TIMELOG_DAYS = 1;
export const MAX_TIMELOG_DAYS = 365;
