import { sql, type SQL } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import type { Issue } from "@/domain/issue/entity";
import { parseCustomFieldKey } from "@/domain/query/columns";
import type { CompiledPredicate } from "@/domain/query/filter-builder";
import type {
  IssueGroup,
  IssueSearchCriteria,
  IssueSearchRepository,
  IssueSearchResult,
  IssueVisibilityScope,
} from "@/domain/query/issue-search";
import type { SortCriterion } from "@/domain/query/sort";

/**
 * The SQL half of the query engine. Everything the issue list shows — the page of rows, the
 * row count, the group counts, the group totals and the grand totals — is computed here in
 * three statements against the same filtered set, so the list never loads more than one
 * page of issues into memory.
 *
 * Table aliases used throughout: `i` issues, `t` trackers, `st` issue_statuses,
 * `pr` enumerations (priority), `au` users (author), `asu` users (assignee),
 * `asg` groups (assignee), `cat` issue_categories, `v` versions.
 */

/**
 * `dateText` is `start_date` / `due_date`, which next-pm stores as `text`, not `date`. They
 * have to be compared against plain string literals: an explicit `'…'::date` on the other
 * side makes Postgres look for a `text >= date` operator, which doesn't exist. ISO-8601
 * dates sort lexicographically, so plain text comparison is still correct.
 */
type OperandType = "id" | "text" | "dateText" | "timestamp" | "number" | "bool";

interface Operand {
  sql: SQL;
  type: OperandType;
}

/** Column key -> the expression to ORDER BY. */
const SORT_EXPRESSIONS: Record<string, SQL> = {
  // next-pm's ids are random UUIDs, so Redmine's `issues.id DESC` ("newest first") has to
  // sort on the creation timestamp instead to mean the same thing.
  id: sql`i.created_at`,
  tracker: sql`t.position`,
  status: sql`st.position`,
  priority: sql`pr.position`,
  subject: sql`i.subject`,
  // One concatenated expression rather than Redmine's two-column `fields_for_order_statement`,
  // so `asc`/`desc` applies to the whole name instead of only its last part.
  author: sql`au.lastname || ' ' || au.firstname`,
  assigned_to: sql`coalesce(asu.lastname || ' ' || asu.firstname, asg.name)`,
  category: sql`cat.name`,
  fixed_version: sql`v.name`,
  start_date: sql`i.start_date`,
  due_date: sql`i.due_date`,
  estimated_hours: sql`i.estimated_hours`,
  done_ratio: sql`i.done_ratio`,
  is_private: sql`i.is_private`,
  created_on: sql`i.created_at`,
  updated_on: sql`i.updated_at`,
  spent_hours: sql`coalesce((select sum(te.hours) from time_entries te where te.issue_id = i.id), 0)`,
};

/**
 * Column key -> the expression to GROUP BY. Association columns group on the foreign key
 * rather than the label, so the page can resolve names from the lookup maps it already has
 * and two same-named rows never collapse into one group.
 */
const GROUP_EXPRESSIONS: Record<string, SQL> = {
  tracker: sql`i.tracker_id`,
  status: sql`i.status_id`,
  priority: sql`i.priority_id`,
  author: sql`i.author_id`,
  assigned_to: sql`i.assigned_to_id`,
  category: sql`i.category_id`,
  fixed_version: sql`i.fixed_version_id`,
  start_date: sql`i.start_date`,
  due_date: sql`i.due_date`,
  done_ratio: sql`i.done_ratio`,
  is_private: sql`i.is_private`,
  // Rendered as ISO text rather than a date, so the group key the driver hands back is
  // comparable with the one `issueGroupValue` computes per row (a pg `date` would come back
  // as a JS Date). ISO text also sorts chronologically.
  created_on: sql`to_char(i.created_at, 'YYYY-MM-DD')`,
  updated_on: sql`to_char(i.updated_at, 'YYYY-MM-DD')`,
};

/** Filter field name -> the operand its predicates compare against. */
const FILTER_OPERANDS: Record<string, Operand> = {
  status_id: { sql: sql`i.status_id`, type: "id" },
  tracker_id: { sql: sql`i.tracker_id`, type: "id" },
  priority_id: { sql: sql`i.priority_id`, type: "id" },
  author_id: { sql: sql`i.author_id`, type: "id" },
  assigned_to_id: { sql: sql`i.assigned_to_id`, type: "id" },
  category_id: { sql: sql`i.category_id`, type: "id" },
  fixed_version_id: { sql: sql`i.fixed_version_id`, type: "id" },
  subject: { sql: sql`i.subject`, type: "text" },
  start_date: { sql: sql`i.start_date`, type: "dateText" },
  due_date: { sql: sql`i.due_date`, type: "dateText" },
  created_on: { sql: sql`i.created_at`, type: "timestamp" },
  updated_on: { sql: sql`i.updated_at`, type: "timestamp" },
  estimated_hours: { sql: sql`i.estimated_hours`, type: "number" },
  done_ratio: { sql: sql`i.done_ratio`, type: "number" },
  is_private: { sql: sql`i.is_private`, type: "bool" },
};

/**
 * Guards the text -> numeric cast on `custom_values.value`. The column is free-form text, so
 * one non-numeric row in an int/float field would otherwise abort the whole list query with
 * a cast error; Redmine sidesteps the same problem with its
 * `CAST(CASE value WHEN '' THEN '0' ELSE value END AS decimal(30,3))` dance, which only
 * covers the empty-string case.
 */
const NUMERIC_VALUE = sql`(case when cv.value ~ '^[+-]?[0-9]+(\\.[0-9]+)?$' then cv.value::numeric end)`;

/**
 * SQL form of `isPrivateIssueVisible` (domain/issue/visibility.ts). The two must agree, and
 * are kept in step by hand — note `is distinct from 'group'` rather than `<> 'group'`, so
 * a row with no assignee type behaves the way the JS `!== "group"` does instead of
 * collapsing the whole disjunct to NULL.
 */
export function issueVisibilityClause(scope: IssueVisibilityScope): SQL {
  if (scope.seesAllPrivateIssues) return sql`true`;
  if (!scope.userId) return sql`i.is_private = false`;

  const groupClause =
    scope.userGroupIds.length > 0
      ? sql` or (i.assigned_to_type = 'group' and i.assigned_to_id in ${idList(scope.userGroupIds)})`
      : sql``;

  return sql`(i.is_private = false or i.author_id = ${scope.userId}::uuid or (i.assigned_to_type is distinct from 'group' and i.assigned_to_id = ${scope.userId}::uuid)${groupClause})`;
}

function idList(ids: string[]): SQL {
  return sql`(${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Turns one `CompiledPredicate` into SQL against an arbitrary operand. Returns undefined
 * when the predicate names a field this repository has no operand for, matching the old
 * `toDrizzleCondition`'s "unknown field is ignored" behaviour.
 */
function predicateClause(predicate: CompiledPredicate, operand: Operand): SQL | undefined {
  const { sql: target, type } = operand;
  const values = predicate.values;

  // A date filter against a timestamp column has to compare whole days, the way Redmine's
  // date_clause widens its upper bound to end-of-day.
  const comparable = type === "timestamp" ? sql`${target}::date` : target;

  switch (predicate.kind) {
    case "never":
      return sql`false`;
    case "eq":
      return type === "bool"
        ? sql`${target} = ${values[0] === "1"}`
        : sql`${comparable} in ${literalList(values, type)}`;
    case "neq":
      return type === "bool"
        ? sql`${target} is distinct from ${values[0] === "1"}`
        : sql`(${target} is null or ${comparable} not in ${literalList(values, type)})`;
    case "isNull":
      // Redmine's "none" also treats '' as absent for string/text fields.
      return type === "text" ? sql`(${target} is null or ${target} = '')` : sql`${target} is null`;
    case "isNotNull":
      return type === "text" ? sql`(${target} is not null and ${target} <> '')` : sql`${target} is not null`;
    case "gte":
      return sql`${comparable} >= ${literal(values[0], type)}`;
    case "lte":
      return sql`${comparable} <= ${literal(values[0], type)}`;
    case "between":
      return sql`${comparable} between ${literal(values[0], type)} and ${literal(values[1], type)}`;
    case "contains":
      return sql`${target} ilike ${`%${escapeLike(values[0])}%`}`;
    case "notContains":
      return sql`(${target} is null or ${target} not ilike ${`%${escapeLike(values[0])}%`})`;
    case "startsWith":
      return sql`${target} ilike ${`${escapeLike(values[0])}%`}`;
    case "endsWith":
      return sql`${target} ilike ${`%${escapeLike(values[0])}`}`;
    default:
      return undefined;
  }
}

function literal(value: string, type: OperandType): SQL {
  switch (type) {
    case "id":
      return sql`${value}::uuid`;
    case "number":
      return sql`${Number(value)}`;
    case "timestamp":
      return sql`${value}::date`;
    case "bool":
      return sql`${value === "1"}`;
    default:
      return sql`${value}`;
  }
}

function literalList(values: string[], type: OperandType): SQL {
  return sql`(${sql.join(
    values.map((value) => literal(value, type)),
    sql`, `,
  )})`;
}

/**
 * Custom field predicates become an EXISTS over `custom_values`, the same shape as
 * Redmine's `sql_for_custom_field`. "none"/"any" are inverted into NOT EXISTS / EXISTS of a
 * non-empty value rather than compared inside the subselect, because an issue with no row
 * at all must count as empty.
 */
function customFieldClause(predicate: CompiledPredicate, customFieldId: string, numeric: boolean): SQL | undefined {
  const scope = sql`from custom_values cv where cv.customized_type = 'Issue' and cv.customized_id = i.id and cv.custom_field_id = ${customFieldId}::uuid`;

  if (predicate.kind === "isNull") {
    return sql`not exists (select 1 ${scope} and cv.value is not null and cv.value <> '')`;
  }
  if (predicate.kind === "isNotNull") {
    return sql`exists (select 1 ${scope} and cv.value is not null and cv.value <> '')`;
  }

  const operand: Operand = numeric ? { sql: NUMERIC_VALUE, type: "number" } : { sql: sql`cv.value`, type: "text" };
  const inner = predicateClause(predicate, operand);
  if (!inner) return undefined;

  // `!` on a multi-valued field has to mean "no matching value exists", not "some value
  // differs" — Redmine rewrites the operator to `=` and negates the EXISTS for the same reason.
  if (predicate.kind === "neq" || predicate.kind === "notContains") {
    const positive = predicateClause({ ...predicate, kind: predicate.kind === "neq" ? "eq" : "contains" }, operand);
    return positive ? sql`not exists (select 1 ${scope} and ${positive})` : undefined;
  }
  return sql`exists (select 1 ${scope} and ${inner})`;
}

function filterClause(predicates: CompiledPredicate[], customFieldFormats: Map<string, string>): SQL {
  const clauses = predicates
    .map((predicate) => {
      const customFieldId = parseCustomFieldKey(predicate.field);
      if (customFieldId) {
        const format = customFieldFormats.get(customFieldId);
        if (!format) return undefined;
        return customFieldClause(predicate, customFieldId, format === "int" || format === "float");
      }
      const operand = FILTER_OPERANDS[predicate.field];
      return operand ? predicateClause(predicate, operand) : undefined;
    })
    .filter((clause): clause is SQL => clause !== undefined);

  return clauses.length > 0 ? sql`(${sql.join(clauses, sql` and `)})` : sql`true`;
}

/**
 * Sorting on a custom field needs a correlated subselect rather than a join, since an issue
 * may legitimately have no value for the field. Numeric fields sort numerically, guarded by
 * the same regex as the totals.
 */
function customFieldSortExpression(customFieldId: string, numeric: boolean): SQL {
  const value = numeric ? NUMERIC_VALUE : sql`cv.value`;
  return sql`(select ${value} from custom_values cv where cv.customized_type = 'Issue' and cv.customized_id = i.id and cv.custom_field_id = ${customFieldId}::uuid limit 1)`;
}

function sortExpression(key: string, customFieldFormats: Map<string, string>): SQL | undefined {
  const customFieldId = parseCustomFieldKey(key);
  if (customFieldId) {
    const format = customFieldFormats.get(customFieldId);
    return format ? customFieldSortExpression(customFieldId, format === "int" || format === "float") : undefined;
  }
  return SORT_EXPRESSIONS[key];
}

function groupExpression(key: string, customFieldFormats: Map<string, string>): SQL | undefined {
  const customFieldId = parseCustomFieldKey(key);
  if (customFieldId) {
    return customFieldFormats.has(customFieldId) ? customFieldSortExpression(customFieldId, false) : undefined;
  }
  return GROUP_EXPRESSIONS[key];
}

/**
 * How the groups themselves are ordered. For an association column that's the label-ish
 * expression Redmine sorts the column by (`issue_statuses.position`, a user's name, ...)
 * rather than the foreign key the rows are bucketed on. For everything else the group key
 * already sorts correctly — and must be reused verbatim, since grouping by a date string
 * while ordering by the underlying timestamp would split every day into one group per row.
 */
const GROUP_ORDER_EXPRESSIONS: Record<string, SQL> = {
  tracker: SORT_EXPRESSIONS.tracker,
  status: SORT_EXPRESSIONS.status,
  priority: SORT_EXPRESSIONS.priority,
  author: SORT_EXPRESSIONS.author,
  assigned_to: SORT_EXPRESSIONS.assigned_to,
  category: SORT_EXPRESSIONS.category,
  fixed_version: SORT_EXPRESSIONS.fixed_version,
};

/**
 * The ordering expression *when it differs from the group key itself*, which is only the
 * case for the association columns above. Undefined means "order by the group key", and
 * the callers then order by the output column rather than by a second copy of the
 * expression — two separately-built copies of the same correlated subquery are not
 * recognised as the same expression by Postgres, which rejects the select-list copy with
 * "subquery uses ungrouped column".
 */
function distinctGroupOrderExpression(key: string): SQL | undefined {
  return GROUP_ORDER_EXPRESSIONS[key];
}

function orderByClause(sortCriteria: SortCriterion[], groupOrder: SQL | undefined, customFieldFormats: Map<string, string>): SQL {
  const parts: SQL[] = [];
  // Redmine prepends the group column to the order so rows of one group stay contiguous
  // across page boundaries (Query#group_by_sort_order). It orders by the column's *sortable*
  // expression, not by the group key — statuses come out in workflow order, not id order.
  if (groupOrder) parts.push(sql`${groupOrder} asc nulls last`);

  for (const [key, direction] of sortCriteria) {
    const expression = sortExpression(key, customFieldFormats);
    if (!expression) continue;
    parts.push(direction === "desc" ? sql`${expression} desc nulls last` : sql`${expression} asc nulls last`);
  }
  // Without a unique final key, OFFSET pagination can repeat or skip rows between pages.
  parts.push(sql`i.id asc`);
  return sql.join(parts, sql`, `);
}

/** The FROM + JOINs every statement below shares. Only the sort expressions need the joins. */
const BASE_FROM = sql`
  from issues i
  left join trackers t on t.id = i.tracker_id
  left join issue_statuses st on st.id = i.status_id
  left join enumerations pr on pr.id = i.priority_id
  left join users au on au.id = i.author_id
  left join users asu on asu.id = i.assigned_to_id and i.assigned_to_type = 'user'
  left join groups asg on asg.id = i.assigned_to_id and i.assigned_to_type = 'group'
  left join issue_categories cat on cat.id = i.category_id
  left join versions v on v.id = i.fixed_version_id
`;

/** Per-column SUM expressions for the totals row. */
function totalExpression(key: string, customFieldFormats: Map<string, string>): SQL | undefined {
  if (key === "estimated_hours") return sql`coalesce(sum(i.estimated_hours), 0)`;
  if (key === "spent_hours") {
    return sql`coalesce(sum((select coalesce(sum(te.hours), 0) from time_entries te where te.issue_id = i.id)), 0)`;
  }
  const customFieldId = parseCustomFieldKey(key);
  if (!customFieldId) return undefined;
  const format = customFieldFormats.get(customFieldId);
  if (format !== "int" && format !== "float") return undefined;
  return sql`coalesce(sum(${customFieldSortExpression(customFieldId, true)}), 0)`;
}

/** The project scope, the private-issue rule and the user's filters, in one WHERE. */
function whereClause(
  projectId: string,
  visibility: IssueVisibilityScope,
  predicates: CompiledPredicate[],
  customFieldFormats: Map<string, string>,
): SQL {
  return sql`where i.project_id = ${projectId}::uuid and ${issueVisibilityClause(visibility)} and ${filterClause(predicates, customFieldFormats)}`;
}

function toDomain(row: Record<string, unknown>): Issue {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    trackerId: row.tracker_id as string,
    statusId: row.status_id as string,
    priorityId: row.priority_id as string,
    subject: row.subject as string,
    description: row.description as string,
    authorId: row.author_id as string,
    assignedToId: row.assigned_to_id as string | null,
    assignedToType: row.assigned_to_type as "user" | "group" | null,
    parentId: row.parent_id as string | null,
    fixedVersionId: row.fixed_version_id as string | null,
    categoryId: row.category_id as string | null,
    isPrivate: row.is_private as boolean,
    doneRatio: row.done_ratio as number,
    estimatedHours: row.estimated_hours as number | null,
    startDate: row.start_date as string | null,
    dueDate: row.due_date as string | null,
    lockVersion: row.lock_version as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class DrizzleIssueSearchRepository implements IssueSearchRepository {
  async count(criteria: Omit<IssueSearchCriteria, "sort" | "groupBy" | "totalableKeys" | "offset" | "limit">): Promise<number> {
    const customFieldFormats = await loadCustomFieldFormats();
    const result = await db.execute<{ row_count: string }>(
      sql`select count(*) as row_count ${BASE_FROM} ${whereClause(criteria.projectId, criteria.visibility, criteria.predicates, customFieldFormats)}`,
    );
    return toNumber(result.rows[0]?.row_count);
  }

  async search(criteria: IssueSearchCriteria): Promise<IssueSearchResult> {
    return this.run(criteria, criteria.limit, criteria.offset);
  }

  async searchAll(criteria: Omit<IssueSearchCriteria, "offset" | "limit">, limit: number): Promise<IssueSearchResult> {
    return this.run({ ...criteria, offset: 0, limit }, limit, 0);
  }

  private async run(criteria: IssueSearchCriteria, limit: number, offset: number): Promise<IssueSearchResult> {
    const customFieldFormats = await loadCustomFieldFormats();
    const where = whereClause(criteria.projectId, criteria.visibility, criteria.predicates, customFieldFormats);
    const group = criteria.groupBy ? groupExpression(criteria.groupBy, customFieldFormats) : undefined;
    // The key the rows are bucketed by and the expression the buckets are *ordered* by are
    // not the same thing: grouping by status buckets on status_id but orders on the
    // status's position, so the groups come out in workflow order.
    const distinctGroupOrder = criteria.groupBy ? distinctGroupOrderExpression(criteria.groupBy) : undefined;
    const rowGroupOrder = distinctGroupOrder ?? group;
    const totalKeys = criteria.totalableKeys.filter((key) => totalExpression(key, customFieldFormats) !== undefined);

    const [summary, groups, rows] = await Promise.all([
      this.loadSummary(where, totalKeys, customFieldFormats),
      group ? this.loadGroups(where, group, distinctGroupOrder, totalKeys, customFieldFormats) : Promise.resolve(null),
      this.loadRows(where, criteria, rowGroupOrder, customFieldFormats, limit, offset),
    ]);

    // Both of these are bounded by the page size, so they stay one extra round trip each
    // rather than the N+1 a per-row lookup would be.
    const issueIds = rows.map((issue) => issue.id);
    const [customValues, spentHours] = await Promise.all([loadCustomValues(issueIds), loadSpentHours(issueIds)]);

    return { issues: rows, customValues, spentHours, ...summary, groups };
  }

  private async loadSummary(
    where: SQL,
    totalKeys: string[],
    customFieldFormats: Map<string, string>,
  ): Promise<{ totalCount: number; totals: Record<string, number> }> {
    const totalSelects = totalKeys.map((key, index) => sql`${totalExpression(key, customFieldFormats)} as ${sql.raw(`total_${index}`)}`);
    const selects = sql.join([sql`count(*) as row_count`, ...totalSelects], sql`, `);
    const result = await db.execute<Record<string, unknown>>(sql`select ${selects} ${BASE_FROM} ${where}`);
    const row = result.rows[0] ?? {};
    return {
      totalCount: toNumber(row.row_count),
      totals: Object.fromEntries(totalKeys.map((key, index) => [key, toNumber(row[`total_${index}`])])),
    };
  }

  private async loadGroups(
    where: SQL,
    group: SQL,
    distinctGroupOrder: SQL | undefined,
    totalKeys: string[],
    customFieldFormats: Map<string, string>,
  ): Promise<IssueGroup[]> {
    const totalSelects = totalKeys.map((key, index) => sql`${totalExpression(key, customFieldFormats)} as ${sql.raw(`total_${index}`)}`);
    const selects = sql.join([sql`${group} as group_value`, sql`count(*) as row_count`, ...totalSelects], sql`, `);
    // `group by 1` rather than by a second copy of the expression: a custom-field group key
    // is a correlated subquery whose custom_field_id is a bound parameter, so re-emitting
    // it here would allocate a *different* placeholder and Postgres would no longer
    // recognise it as the same expression as the one in the select list ("subquery uses
    // ungrouped column"). The output-column ordinal matches by construction.
    //
    // When the groups are ordered by something other than the key they're bucketed on (the
    // association columns), that expression has to be grouped as well — it's functionally
    // dependent on the key, but Postgres only infers that through a primary key, not
    // through a join.
    const grouping = distinctGroupOrder ? sql`group by 1, ${distinctGroupOrder}` : sql`group by 1`;
    const ordering = distinctGroupOrder ? sql`order by ${distinctGroupOrder} asc nulls last` : sql`order by group_value asc nulls last`;
    const result = await db.execute<Record<string, unknown>>(sql`select ${selects} ${BASE_FROM} ${where} ${grouping} ${ordering}`);
    return result.rows.map((row) => ({
      value: row.group_value === null || row.group_value === undefined ? null : String(row.group_value),
      count: toNumber(row.row_count),
      totals: Object.fromEntries(totalKeys.map((key, index) => [key, toNumber(row[`total_${index}`])])),
    }));
  }

  private async loadRows(
    where: SQL,
    criteria: IssueSearchCriteria,
    group: SQL | undefined,
    customFieldFormats: Map<string, string>,
    limit: number,
    offset: number,
  ): Promise<Issue[]> {
    const order = orderByClause(criteria.sort, group, customFieldFormats);
    const result = await db.execute<Record<string, unknown>>(
      sql`select i.* ${BASE_FROM} ${where} order by ${order} limit ${limit} offset ${offset}`,
    );
    return result.rows.map(toDomain);
  }
}

async function loadCustomFieldFormats(): Promise<Map<string, string>> {
  const result = await db.execute<{ id: string; field_format: string }>(
    sql`select id, field_format from custom_fields where customized_type = 'Issue'`,
  );
  return new Map(result.rows.map((row) => [row.id, row.field_format]));
}

async function loadCustomValues(issueIds: string[]): Promise<Map<string, string>> {
  if (issueIds.length === 0) return new Map();
  const result = await db.execute<{ customized_id: string; custom_field_id: string; value: string | null }>(
    sql`select customized_id, custom_field_id, value from custom_values where customized_type = 'Issue' and customized_id in ${idList(issueIds)}`,
  );
  return new Map(result.rows.filter((row) => row.value !== null).map((row) => [`${row.customized_id}:${row.custom_field_id}`, row.value as string]));
}

async function loadSpentHours(issueIds: string[]): Promise<Map<string, number>> {
  if (issueIds.length === 0) return new Map();
  const result = await db.execute<{ issue_id: string; hours: string }>(
    sql`select issue_id, sum(hours) as hours from time_entries where issue_id in ${idList(issueIds)} group by issue_id`,
  );
  return new Map(result.rows.map((row) => [row.issue_id, toNumber(row.hours)]));
}
