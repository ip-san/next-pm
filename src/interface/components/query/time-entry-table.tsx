import { Fragment } from "react";
import Link from "next/link";
import type { ListTimeEntriesResult } from "@/application/time-entries/list-time-entries";
import type { QueryColumn } from "@/domain/query/columns";
import { linkedPages } from "@/domain/query/pagination";
import { sortDirectionFor, toggleSortCriteria } from "@/domain/query/sort";
import type { TimeEntry } from "@/domain/time-entry/entity";
import { issueListHref, type IssueListParams } from "@/interface/query/issue-query-params";
import { timeEntryColumnValue, timeEntryGroupLabel, timeEntryGroupValue, type TimeEntryListLookups } from "@/interface/query/time-entry-list-view";
import { DeleteTimeEntryButton } from "./delete-time-entry-button";

export interface TimeEntryTableProps {
  result: ListTimeEntriesResult;
  lookups: TimeEntryListLookups;
  /** Where the sort/pager links point. */
  basePath: string;
  listParams: IssueListParams;
  /** Project id -> identifier, for the row links. Only the projects on the page need an entry. */
  projectIdentifierById: Map<string, string>;
  /** Which rows offer edit/delete — `TimeEntry#editable_by?`, decided per entry by the caller. */
  isEditable: (entry: TimeEntry) => boolean;
}

/**
 * The time-entry list table, shared by the project list and the cross-project one so the
 * two can never disagree on a column, a group header or a total. Everything it renders
 * comes from `listTimeEntries`; it owns no data access of its own.
 */
export function TimeEntryTable({ result, lookups, basePath, listParams, projectIdentifierById, isEditable }: TimeEntryTableProps) {
  const groupsByValue = new Map((result.search.groups ?? []).map((group) => [group.value, group]));
  const totalColumns = result.effective.totalableNames
    .map((key) => result.availableColumns.find((column) => column.key === key))
    .filter((column): column is QueryColumn => column !== undefined);

  const groupBy = result.effective.groupBy;
  const rows = result.search.entries.map((entry, index) => {
    const groupValue = groupBy ? timeEntryGroupValue(groupBy, entry, result.search.customValues) : undefined;
    const previous = index === 0 ? undefined : result.search.entries[index - 1];
    const previousValue = groupBy && previous ? timeEntryGroupValue(groupBy, previous, result.search.customValues) : undefined;
    return { entry, groupValue, startsGroup: groupValue !== undefined && (index === 0 || groupValue !== previousValue) };
  });

  const rowContext = { lookups, customValues: result.search.customValues };
  const columnCount = result.displayColumns.length + 1;

  const linkWith = (overrides: Partial<IssueListParams>) =>
    issueListHref(basePath, listParams, {
      ...result.effective,
      columnKeys: result.effective.columnNames,
      totalableKeys: result.effective.totalableNames,
      ...overrides,
    });

  return (
    <>
      <p className="text-sm text-gray-600">
        {result.pagination.itemCount}件中 {result.pagination.firstItem}–{result.pagination.lastItem}件を表示
      </p>

      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            {result.displayColumns.map((column) => (
              <th key={column.key} className="pr-4 py-1">
                {column.sortable ? (
                  <Link
                    href={linkWith({ sortCriteria: toggleSortCriteria(result.effective.sortCriteria, column), page: undefined })}
                    className="underline"
                  >
                    {column.label}
                    {sortDirectionFor(result.effective.sortCriteria, column.key) === "asc" ? " ▲" : null}
                    {sortDirectionFor(result.effective.sortCriteria, column.key) === "desc" ? " ▼" : null}
                  </Link>
                ) : (
                  column.label
                )}
              </th>
            ))}
            <th className="pr-4 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry, groupValue, startsGroup }) => {
            // Group counts and totals come from the aggregate query over the *whole*
            // filtered set, so a header shows its real size even when the page cuts the
            // group in half.
            const group = startsGroup ? groupsByValue.get(groupValue ?? null) : undefined;
            const identifier = projectIdentifierById.get(entry.projectId) ?? "";
            return (
              <Fragment key={entry.id}>
                {startsGroup ? (
                  <tr className="bg-gray-50 border-b">
                    <td colSpan={columnCount} className="py-1 font-semibold">
                      {timeEntryGroupLabel(groupBy as string, groupValue ?? null, lookups)} ({group?.count ?? 0})
                      {totalColumns.map((column) => (
                        <span key={column.key} className="ml-3 font-normal text-gray-600">
                          {column.label}: {group?.totals[column.key] ?? 0}
                        </span>
                      ))}
                    </td>
                  </tr>
                ) : null}
                <tr className="border-b">
                  {result.displayColumns.map((column) => (
                    <td key={column.key} className="pr-4 py-1">
                      {column.key === "issue" && entry.issueId ? (
                        <Link href={`/projects/${identifier}/issues/${entry.issueId}`} className="underline">
                          {timeEntryColumnValue(column, entry, rowContext)}
                        </Link>
                      ) : column.key === "project" ? (
                        <Link href={`/projects/${identifier}/time-entries`} className="underline">
                          {timeEntryColumnValue(column, entry, rowContext)}
                        </Link>
                      ) : (
                        timeEntryColumnValue(column, entry, rowContext)
                      )}
                    </td>
                  ))}
                  <td className="pr-4 py-1 whitespace-nowrap">
                    {isEditable(entry) ? (
                      <span className="flex items-center gap-2">
                        <Link href={`/projects/${identifier}/time-entries/${entry.id}/edit`} className="text-xs underline">
                          編集
                        </Link>
                        <DeleteTimeEntryButton projectIdentifier={identifier} entryId={entry.id} />
                      </span>
                    ) : null}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
        {totalColumns.length > 0 ? (
          <tfoot>
            <tr className="border-t-2 font-semibold">
              {result.displayColumns.map((column, index) => (
                <td key={column.key} className="pr-4 py-1">
                  {index === 0 ? "合計" : null}
                  {result.effective.totalableNames.includes(column.key) ? (result.search.totals[column.key] ?? 0) : null}
                </td>
              ))}
              <td />
            </tr>
            {/* Totals for columns that aren't displayed still have to appear somewhere. */}
            {totalColumns.some((column) => !result.displayColumns.includes(column)) ? (
              <tr>
                <td colSpan={columnCount} className="py-1 text-gray-600 font-normal">
                  {totalColumns
                    .filter((column) => !result.displayColumns.includes(column))
                    .map((column) => `${column.label}: ${result.search.totals[column.key] ?? 0}`)
                    .join(" / ")}
                </td>
              </tr>
            ) : null}
          </tfoot>
        ) : null}
      </table>

      <nav className="flex items-center gap-3 text-sm flex-wrap" aria-label="ページ送り">
        {linkedPages(result.pagination).map((page) => (
          <Link
            key={page}
            href={linkWith({ page: String(page), perPage: String(result.pagination.perPage) })}
            className={page === result.pagination.page ? "font-semibold" : "underline"}
          >
            {page}
          </Link>
        ))}
        <span className="text-gray-500">表示件数:</span>
        {result.perPageOptions.map((option) => (
          <Link
            key={option}
            href={linkWith({ page: undefined, perPage: String(option) })}
            className={option === result.pagination.perPage ? "font-semibold" : "underline"}
          >
            {option}
          </Link>
        ))}
      </nav>
    </>
  );
}
