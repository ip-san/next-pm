/**
 * Port of Redmine's `Setting.per_page_options_array` and
 * `ApplicationController#per_page_option` (application_controller.rb): the admin-configured
 * list of page sizes, and the rule for picking one for a request.
 */

/** Redmine's `per_page_options` setting default (config/settings.yml). */
export const PER_PAGE_OPTIONS_DEFAULT = "25,50,100";

/** Redmine's fallback when the setting parses to nothing. */
const FALLBACK_PER_PAGE = 25;

/**
 * `split(/[\s,]/).collect(&:to_i).select {|n| n > 0}.sort`, except that a setting which
 * parses to nothing falls back to the default list rather than to an empty one — Redmine
 * tolerates `[]` here only because `per_page_option` then defaults to 25 and the page-size
 * links simply disappear, which is worse than ignoring an unusable setting.
 */
export function parsePerPageOptions(raw: string | undefined): number[] {
  const parse = (value: string): number[] => {
    const parsed = value
      .split(/[\s,]+/)
      .map((part) => Number.parseInt(part, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return [...new Set(parsed)].sort((a, b) => a - b);
  };
  const parsed = parse(raw ?? "");
  return parsed.length > 0 ? parsed : parse(PER_PAGE_OPTIONS_DEFAULT);
}

/**
 * Redmine only honours a requested `per_page` when it is one of the configured options —
 * otherwise it falls back to the first option. next-pm has no per-session `per_page` memory
 * (Redmine keeps one in `session[:per_page]`), so the fallback is the only other branch.
 */
export function resolvePerPage(options: number[], requested: string | undefined): number {
  const value = Number.parseInt(requested ?? "", 10);
  if (Number.isFinite(value) && options.includes(value)) return value;
  return options[0] ?? FALLBACK_PER_PAGE;
}

export interface Pagination {
  page: number;
  perPage: number;
  offset: number;
  itemCount: number;
  pageCount: number;
  /** 1-based index of the first item on this page, or 0 when there are none. */
  firstItem: number;
  lastItem: number;
}

/** Port of `Redmine::Pagination::Paginator`. */
export function paginate(itemCount: number, perPage: number, requestedPage: string | undefined): Pagination {
  const parsedPage = Number.parseInt(requestedPage ?? "", 10);
  const pageCount = itemCount === 0 ? 1 : Math.floor((itemCount - 1) / perPage) + 1;
  const page = Math.min(Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1), pageCount);
  const offset = (page - 1) * perPage;
  const firstItem = itemCount === 0 ? 0 : offset + 1;
  return {
    page,
    perPage,
    offset,
    itemCount,
    pageCount,
    firstItem,
    lastItem: Math.min(firstItem + perPage - 1, itemCount),
  };
}

/**
 * `Paginator#linked_pages`: first, last, current and the two pages either side, with no
 * links at all when everything fits on one page.
 */
export function linkedPages(pagination: Pagination): number[] {
  if (pagination.pageCount <= 1) return [];
  const candidates = [1, pagination.pageCount, pagination.page];
  for (let offset = -2; offset <= 2; offset += 1) {
    candidates.push(pagination.page + offset);
  }
  return [...new Set(candidates.filter((page) => page >= 1 && page <= pagination.pageCount))].sort((a, b) => a - b);
}
