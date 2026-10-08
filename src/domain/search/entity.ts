export type SearchResultType = "issue" | "wiki_page" | "news" | "message";

/** Every type next-pm can search. Redmine also registers documents, changesets and projects. */
export const SEARCH_RESULT_TYPES: SearchResultType[] = ["issue", "wiki_page", "news", "message"];

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  excerpt: string;
  /** The type's `date_column` — what Redmine orders the merged result set by, newest first. */
  occurredAt: Date;
}

/**
 * Redmine's `attachments` search option: `'0'` ignores attachments, `'1'` searches their
 * filename and description as well as the record's own columns, and `'only'` searches
 * nothing but the attachments.
 */
export type AttachmentSearchMode = "0" | "1" | "only";

export const ATTACHMENT_SEARCH_MODES: AttachmentSearchMode[] = ["0", "1", "only"];

/**
 * What a search run looks for, shared by every searchable repository — the SQL half of
 * `acts_as_searchable`'s `search_tokens_condition` plus the per-type switches from
 * `SearchController#index`.
 */
export interface SearchCriteria {
  /** Already tokenized by `tokenizeSearchQuery`; empty means "no search at all". */
  tokens: string[];
  /** Redmine's `all_words` (default true): every token must match, rather than any of them. */
  allWords: boolean;
  /** Redmine's `titles_only`: match only the type's first searchable column. */
  titlesOnly: boolean;
  attachments: AttachmentSearchMode;
}

/** The issue search takes one more switch than the others — Redmine's `options[:open_issues]`. */
export interface IssueSearchOptions extends SearchCriteria {
  openIssues: boolean;
}

/**
 * Redmine's search `scope` radio. `project` is the implicit default on a project page;
 * `subprojects` widens it to that project's descendants, and the other two ignore the page's
 * project entirely.
 */
export type SearchScope = "all" | "my_projects" | "subprojects" | "project";

export const SEARCH_SCOPES: SearchScope[] = ["all", "my_projects", "subprojects", "project"];
