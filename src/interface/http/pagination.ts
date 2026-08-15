/**
 * Mirrors Redmine's REST API pagination contract (offset/limit query params, a
 * `total_count`/`offset`/`limit` envelope alongside the resource array) — every next-pm v1
 * list endpoint previously returned an unbounded array with no way for a client to page
 * through it. Slices in-process rather than pushing LIMIT/OFFSET into each repository query;
 * that's a real remaining inefficiency for very large result sets, but it fixes the actual
 * client-facing contract gap without a broader repository-layer pagination refactor.
 */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface Pagination {
  offset: number;
  limit: number;
}

export function parsePagination(url: URL): Pagination {
  const offsetRaw = Number(url.searchParams.get("offset"));
  const limitRaw = Number(url.searchParams.get("limit"));
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;
  return { offset, limit };
}

export function paginate<T>(items: T[], pagination: Pagination): { items: T[]; total_count: number; offset: number; limit: number } {
  return {
    items: items.slice(pagination.offset, pagination.offset + pagination.limit),
    total_count: items.length,
    offset: pagination.offset,
    limit: pagination.limit,
  };
}
