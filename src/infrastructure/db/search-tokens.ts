import { sql, type SQL } from "drizzle-orm";
import type { SearchCriteria } from "@/domain/search/entity";

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * `acts_as_searchable`'s `search_tokens_condition`: each token has to match at least one of
 * the columns, and the tokens are then ANDed (`all_words`) or ORed. Substring matching, not
 * full text — Redmine's search finds "orm" inside "performance", and a `to_tsvector` index
 * never would.
 */
export function searchTokensCondition(columns: SQL[], criteria: Pick<SearchCriteria, "tokens" | "allWords">): SQL {
  if (criteria.tokens.length === 0 || columns.length === 0) return sql`false`;

  const perToken = criteria.tokens.map((token) => {
    const pattern = `%${escapeLike(token)}%`;
    const matches = columns.map((column) => sql`${column} ilike ${pattern}`);
    return sql`(${sql.join(matches, sql` or `)})`;
  });

  return sql`(${sql.join(perToken, criteria.allWords ? sql` and ` : sql` or `)})`;
}

/**
 * The attachment half of the same condition, as an EXISTS over the polymorphic
 * `attachments` rows of one container. Mirrors the `joins(:attachments)` branch, which
 * matches on filename and description.
 */
export function attachmentTokensCondition(
  containerType: string,
  containerIdColumn: SQL,
  criteria: Pick<SearchCriteria, "tokens" | "allWords">,
): SQL {
  const inner = searchTokensCondition([sql`att.filename`, sql`att.description`], criteria);
  return sql`exists (select 1 from attachments att where att.container_type = ${containerType} and att.container_id = ${containerIdColumn} and ${inner})`;
}

/**
 * Combines the record's own columns with its attachments according to the `attachments`
 * option: `'0'` is columns only, `'only'` is attachments only, `'1'` is either. Redmine
 * additionally ignores the attachment branch under `titles_only` unless the mode is
 * `'only'`, so that "titles only" really does mean titles.
 */
export function searchMatchCondition(options: {
  columns: SQL[];
  titleColumns: SQL[];
  criteria: SearchCriteria;
  attachmentContainerType: string;
  attachmentContainerIdColumn: SQL;
}): SQL {
  const { criteria } = options;
  const columns = criteria.titlesOnly ? options.titleColumns : options.columns;
  const searchesAttachments = criteria.titlesOnly ? criteria.attachments === "only" : criteria.attachments !== "0";
  const attachmentClause = searchesAttachments
    ? attachmentTokensCondition(options.attachmentContainerType, options.attachmentContainerIdColumn, criteria)
    : null;

  if (criteria.attachments === "only") {
    return attachmentClause ?? sql`false`;
  }
  const own = searchTokensCondition(columns, criteria);
  return attachmentClause ? sql`(${own} or ${attachmentClause})` : own;
}

/** `scope.where("project_id IN (?)", ...)` — an empty project list matches nothing. */
export function projectScopeCondition(column: SQL, projectIds: string[]): SQL {
  if (projectIds.length === 0) return sql`false`;
  return sql`${column} in (${sql.join(
    projectIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}
