import { CUSTOM_VALUE_SEPARATOR } from "@/domain/custom-value/separator";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/infrastructure/db/client";
import { parseCustomFieldKey } from "@/domain/query/columns";
import type { CompiledPredicate } from "@/domain/query/filter-builder";
import type {
  ProjectTimeEntryScope,
  TimeEntryGroup,
  TimeEntrySearchCriteria,
  TimeEntrySearchRepository,
  TimeEntrySearchResult,
  TimeEntryVisibilityScope,
} from "@/domain/query/time-entry-search";
import type { SortCriterion } from "@/domain/query/sort";
import type { TimeEntry } from "@/domain/time-entry/entity";

/**
 * The SQL half of the time-entry query engine — the same three-statement shape as
 * `issue-search-repository.ts` (page of rows, row count + totals, group counts + totals),
 * so a list of any size never loads more than one page into memory.
 *
 * Table aliases: `te` time_entries, `p` projects, `i` issues, `u` users (the person the
 * time is attributed to), `au` users (the author who recorded it), `a` enumerations
 * (activity).
 */

type OperandType = "id" | "text" | "dateText" | "timestamp" | "number";

interface Operand {
  sql: SQL;
  type: OperandType;
}

const SORT_EXPRESSIONS: Record<string, SQL> = {
  project: sql`p.name`,
  spent_on: sql`te.spent_on`,
  user: sql`u.lastname || ' ' || u.firstname`,
  author: sql`au.lastname || ' ' || au.firstname`,
  activity: sql`a.position`,
  issue: sql`i.subject`,
  comments: sql`te.comments`,
  hours: sql`te.hours`,
  created_on: sql`te.created_at`,
};

const GROUP_EXPRESSIONS: Record<string, SQL> = {
  project: sql`te.project_id`,
  spent_on: sql`te.spent_on`,
  user: sql`te.user_id`,
  activity: sql`te.activity_id`,
  issue: sql`te.issue_id`,
  created_on: sql`to_char(te.created_at, 'YYYY-MM-DD')`,
};

/** Association columns order their groups by the label-ish expression, not by the foreign key. */
const GROUP_ORDER_EXPRESSIONS: Record<string, SQL> = {
  project: SORT_EXPRESSIONS.project,
  user: SORT_EXPRESSIONS.user,
  activity: SORT_EXPRESSIONS.activity,
  issue: SORT_EXPRESSIONS.issue,
};

const FILTER_OPERANDS: Record<string, Operand> = {
  project_id: { sql: sql`te.project_id`, type: "id" },
  // `spent_on` is stored as text (ISO-8601 sorts lexicographically), like the issue dates.
  spent_on: { sql: sql`te.spent_on`, type: "dateText" },
  user_id: { sql: sql`te.user_id`, type: "id" },
  author_id: { sql: sql`te.author_id`, type: "id" },
  activity_id: { sql: sql`te.activity_id`, type: "id" },
  issue_id: { sql: sql`te.issue_id`, type: "id" },
  comments: { sql: sql`te.comments`, type: "text" },
  hours: { sql: sql`te.hours`, type: "number" },
  created_on: { sql: sql`te.created_at`, type: "timestamp" },
};

const NUMERIC_VALUE = sql`(case when cv.value ~ '^[+-]?[0-9]+(\\.[0-9]+)?$' then cv.value::numeric end)`;

function idList(ids: string[]): SQL {
  return sql`(${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function literal(value: string, type: OperandType): SQL {
  switch (type) {
    case "id":
      return sql`${value}::uuid`;
    case "number":
      return sql`${Number(value)}`;
    case "timestamp":
      return sql`${value}::date`;
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

function predicateClause(predicate: CompiledPredicate, operand: Operand): SQL | undefined {
  const { sql: target, type } = operand;
  const values = predicate.values;
  const comparable = type === "timestamp" ? sql`${target}::date` : target;

  switch (predicate.kind) {
    case "never":
      return sql`false`;
    case "eq":
      return sql`${comparable} in ${literalList(values, type)}`;
    case "neq":
      return sql`(${target} is null or ${comparable} not in ${literalList(values, type)})`;
    case "isNull":
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

/** Custom field predicates become an EXISTS over `custom_values`, as on the issue side. */
function customFieldClause(predicate: CompiledPredicate, customFieldId: string, numeric: boolean): SQL | undefined {
  const scope = sql`from custom_values cv where cv.customized_type = 'TimeEntry' and cv.customized_id = te.id and cv.custom_field_id = ${customFieldId}::uuid`;

  if (predicate.kind === "isNull") {
    return sql`not exists (select 1 ${scope} and cv.value is not null and cv.value <> '')`;
  }
  if (predicate.kind === "isNotNull") {
    return sql`exists (select 1 ${scope} and cv.value is not null and cv.value <> '')`;
  }

  const operand: Operand = numeric ? { sql: NUMERIC_VALUE, type: "number" } : { sql: sql`cv.value`, type: "text" };
  const inner = predicateClause(predicate, operand);
  if (!inner) return undefined;

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

function projectIdsWhere(scopes: ProjectTimeEntryScope[], predicate: (scope: ProjectTimeEntryScope) => boolean): string[] {
  return scopes.filter(predicate).map((scope) => scope.projectId);
}

/**
 * SQL form of `TimeEntry.visible_condition` — one disjunct per role verdict, with the
 * projects sharing a verdict collapsed into one `IN` list.
 */
function timeEntryReachClause(scope: TimeEntryVisibilityScope): SQL {
  const allIds = projectIdsWhere(scope.projects, (project) => project.timeEntries === "all");
  const ownIds = projectIdsWhere(scope.projects, (project) => project.timeEntries === "own");

  const clauses: SQL[] = [];
  if (allIds.length > 0) clauses.push(sql`te.project_id in ${idList(allIds)}`);
  if (ownIds.length > 0 && scope.userId) {
    clauses.push(sql`(te.project_id in ${idList(ownIds)} and te.user_id = ${scope.userId}::uuid)`);
  }
  return clauses.length > 0 ? sql`(${sql.join(clauses, sql` or `)})` : sql`false`;
}

/**
 * next-pm's extra narrowing: an entry attached to an issue the viewer may not see is
 * hidden outright. `i` is joined unconditionally here (unlike Redmine's `left_join_issue`,
 * which joins on the visibility condition and leaves the entry listed with a blank issue),
 * because this list has to agree with `canAccessTimeEntry`, which drops such an entry.
 */
function issueReachClause(scope: TimeEntryVisibilityScope): SQL {
  const unrestricted = projectIdsWhere(scope.projects, (project) => project.issues === "all");
  const restricted = projectIdsWhere(scope.projects, (project) => project.issues === "visible_only");

  const clauses: SQL[] = [];
  if (unrestricted.length > 0) clauses.push(sql`i.project_id in ${idList(unrestricted)}`);
  if (restricted.length > 0) {
    clauses.push(sql`(i.project_id in ${idList(restricted)} and ${privateIssueClause(scope)})`);
  }
  const visible = clauses.length > 0 ? sql`(${sql.join(clauses, sql` or `)})` : sql`false`;
  return sql`(te.issue_id is null or ${visible})`;
}

/** The private-issue rule from `domain/issue/visibility.ts`, against the joined `i` alias. */
function privateIssueClause(scope: TimeEntryVisibilityScope): SQL {
  if (!scope.userId) return sql`i.is_private = false`;
  const groupClause =
    scope.userGroupIds.length > 0
      ? sql` or (i.assigned_to_type = 'group' and i.assigned_to_id in ${idList(scope.userGroupIds)})`
      : sql``;
  return sql`(i.is_private = false or i.author_id = ${scope.userId}::uuid or (i.assigned_to_type is distinct from 'group' and i.assigned_to_id = ${scope.userId}::uuid)${groupClause})`;
}

function whereClause(
  criteria: Pick<TimeEntrySearchCriteria, "predicates" | "visibility">,
  customFieldFormats: Map<string, string>,
): SQL {
  return sql`where ${timeEntryReachClause(criteria.visibility)} and ${issueReachClause(criteria.visibility)} and ${filterClause(criteria.predicates, customFieldFormats)}`;
}

function customFieldSortExpression(customFieldId: string, numeric: boolean): SQL {
  const value = numeric ? NUMERIC_VALUE : sql`cv.value`;
  return sql`(select ${value} from custom_values cv where cv.customized_type = 'TimeEntry' and cv.customized_id = te.id and cv.custom_field_id = ${customFieldId}::uuid limit 1)`;
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

function distinctGroupOrderExpression(key: string): SQL | undefined {
  return GROUP_ORDER_EXPRESSIONS[key];
}

function orderByClause(sortCriteria: SortCriterion[], groupOrder: SQL | undefined, customFieldFormats: Map<string, string>): SQL {
  const parts: SQL[] = [];
  if (groupOrder) parts.push(sql`${groupOrder} asc nulls last`);
  for (const [key, direction] of sortCriteria) {
    const expression = sortExpression(key, customFieldFormats);
    if (!expression) continue;
    parts.push(direction === "desc" ? sql`${expression} desc nulls last` : sql`${expression} asc nulls last`);
  }
  // Without a unique final key, OFFSET pagination can repeat or skip rows between pages.
  parts.push(sql`te.id asc`);
  return sql.join(parts, sql`, `);
}

const BASE_FROM = sql`
  from time_entries te
  left join projects p on p.id = te.project_id
  left join issues i on i.id = te.issue_id
  left join users u on u.id = te.user_id
  left join users au on au.id = te.author_id
  left join enumerations a on a.id = te.activity_id
`;

function totalExpression(key: string, customFieldFormats: Map<string, string>): SQL | undefined {
  if (key === "hours") return sql`coalesce(sum(te.hours), 0)`;
  const customFieldId = parseCustomFieldKey(key);
  if (!customFieldId) return undefined;
  const format = customFieldFormats.get(customFieldId);
  if (format !== "int" && format !== "float") return undefined;
  return sql`coalesce(sum(${customFieldSortExpression(customFieldId, true)}), 0)`;
}

function toDomain(row: Record<string, unknown>): TimeEntry {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    issueId: row.issue_id as string | null,
    userId: row.user_id as string,
    authorId: row.author_id as string,
    activityId: row.activity_id as string,
    hours: Number(row.hours),
    comments: row.comments as string,
    spentOn: row.spent_on as string,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class DrizzleTimeEntrySearchRepository implements TimeEntrySearchRepository {
  async count(criteria: Pick<TimeEntrySearchCriteria, "predicates" | "visibility">): Promise<number> {
    const customFieldFormats = await loadCustomFieldFormats();
    const result = await db.execute<{ row_count: string }>(
      sql`select count(*) as row_count ${BASE_FROM} ${whereClause(criteria, customFieldFormats)}`,
    );
    return toNumber(result.rows[0]?.row_count);
  }

  async search(criteria: TimeEntrySearchCriteria): Promise<TimeEntrySearchResult> {
    return this.run(criteria, criteria.limit, criteria.offset);
  }

  async searchAll(criteria: Omit<TimeEntrySearchCriteria, "offset" | "limit">, limit: number): Promise<TimeEntrySearchResult> {
    return this.run({ ...criteria, offset: 0, limit }, limit, 0);
  }

  private async run(criteria: TimeEntrySearchCriteria, limit: number, offset: number): Promise<TimeEntrySearchResult> {
    const customFieldFormats = await loadCustomFieldFormats();
    const where = whereClause(criteria, customFieldFormats);
    const group = criteria.groupBy ? groupExpression(criteria.groupBy, customFieldFormats) : undefined;
    const distinctGroupOrder = criteria.groupBy ? distinctGroupOrderExpression(criteria.groupBy) : undefined;
    const rowGroupOrder = distinctGroupOrder ?? group;
    const totalKeys = criteria.totalableKeys.filter((key) => totalExpression(key, customFieldFormats) !== undefined);

    const [summary, groups, rows] = await Promise.all([
      this.loadSummary(where, totalKeys, customFieldFormats),
      group ? this.loadGroups(where, group, distinctGroupOrder, totalKeys, customFieldFormats) : Promise.resolve(null),
      this.loadRows(where, criteria.sort, rowGroupOrder, customFieldFormats, limit, offset),
    ]);

    const customValues = await loadCustomValues(rows.map((entry) => entry.id));

    return { entries: rows, customValues, ...summary, groups };
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
  ): Promise<TimeEntryGroup[]> {
    const totalSelects = totalKeys.map((key, index) => sql`${totalExpression(key, customFieldFormats)} as ${sql.raw(`total_${index}`)}`);
    const selects = sql.join([sql`${group} as group_value`, sql`count(*) as row_count`, ...totalSelects], sql`, `);
    // `group by 1` for the same reason as the issue side: a custom-field group key is a
    // correlated subquery whose bound parameter would not be recognised as the same
    // expression if re-emitted here.
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
    sortCriteria: SortCriterion[],
    group: SQL | undefined,
    customFieldFormats: Map<string, string>,
    limit: number,
    offset: number,
  ): Promise<TimeEntry[]> {
    const order = orderByClause(sortCriteria, group, customFieldFormats);
    const result = await db.execute<Record<string, unknown>>(
      sql`select te.* ${BASE_FROM} ${where} order by ${order} limit ${limit} offset ${offset}`,
    );
    return result.rows.map(toDomain);
  }
}

async function loadCustomFieldFormats(): Promise<Map<string, string>> {
  const result = await db.execute<{ id: string; field_format: string }>(
    sql`select id, field_format from custom_fields where customized_type = 'TimeEntry'`,
  );
  return new Map(result.rows.map((row) => [row.id, row.field_format]));
}

async function loadCustomValues(entryIds: string[]): Promise<Map<string, string>> {
  if (entryIds.length === 0) return new Map();
  const result = await db.execute<{ customized_id: string; custom_field_id: string; value: string | null }>(
    sql`select customized_id, custom_field_id, value from custom_values where customized_type = 'TimeEntry' and customized_id in ${idList(entryIds)} order by value`,
  );
  // A multiple-valued field has one row per value; they read back as one entry, one value per line.
  const grouped = new Map<string, string[]>();
  for (const row of result.rows) {
    if (row.value === null) continue;
    const key = `${row.customized_id}:${row.custom_field_id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row.value]);
  }
  return new Map([...grouped].map(([key, values]) => [key, values.join(CUSTOM_VALUE_SEPARATOR)]));
}
