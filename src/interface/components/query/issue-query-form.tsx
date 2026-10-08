"use client";

import { useState } from "react";
import {
  DAY_COUNT_OPERATORS,
  RANGE_OPERATORS,
  VALUELESS_OPERATORS,
  type QueryColumn,
} from "@/domain/query/columns";
import type { FilterCondition, FilterOperator } from "@/domain/query/filter-builder";
import { serializeSortCriteria, type SortCriterion } from "@/domain/query/sort";

/** Japanese labels for Redmine's operator keys (`Query.operators_labels`). */
const OPERATOR_LABELS: Record<string, string> = {
  "=": "等しい",
  "!": "等しくない",
  o: "未完了",
  c: "完了",
  "!*": "なし",
  "*": "すべて",
  ">=": "以上",
  "<=": "以下",
  "><": "期間",
  "<t+": "今日から〜日以内",
  ">t+": "今日から〜日より後",
  "><t+": "これからの〜日以内",
  "t+": "今日から〜日後",
  nd: "明日",
  t: "今日",
  ld: "昨日",
  nw: "来週",
  w: "今週",
  lw: "先週",
  l2w: "過去2週間",
  nm: "来月",
  m: "今月",
  lm: "先月",
  y: "今年",
  ">t-": "〜日以内",
  "<t-": "〜日より前",
  "><t-": "過去〜日以内",
  "t-": "〜日前",
  "~": "含む",
  "!~": "含まない",
  "^": "で始まる",
  $: "で終わる",
};

export interface FilterValueOption {
  value: string;
  label: string;
}

export interface IssueQueryFormProps {
  action: string;
  /** Everything filterable/displayable for this viewer. */
  columns: QueryColumn[];
  /** Selectable values per filter field, for the list-style inputs. */
  valueOptions: Record<string, FilterValueOption[]>;
  initialFilters: FilterCondition[];
  initialColumnKeys: string[];
  initialGroupBy: string | null;
  initialTotalableKeys: string[];
  /** Carried through unchanged so applying a filter doesn't reset the sort. */
  sortCriteria: SortCriterion[];
  perPage: string;
  /**
   * The saved query being viewed, if any. Carried through so that changing the filters or
   * columns stays *inside* that query — without it, applying a change would detach to an
   * ad-hoc list and the "update this query" form would vanish, leaving a saved query's
   * filters permanently uneditable.
   */
  queryId?: string;
}

interface FilterRow {
  field: string;
  operator: FilterOperator;
  values: string[];
}

function valueCount(operator: FilterOperator): number {
  if (VALUELESS_OPERATORS.includes(operator)) return 0;
  return RANGE_OPERATORS.includes(operator) ? 2 : 1;
}

/**
 * Redmine's in-place filter builder (`app/views/queries/_filters.html.erb`), as a plain GET
 * form: every input is named with Redmine's own `f[]` / `op[field]` / `v[field][]` scheme,
 * so submitting it produces exactly the URL `parseIssueListParams` reads back and the page
 * stays shareable and bookmarkable without any client-side routing.
 */
export function IssueQueryForm(props: IssueQueryFormProps) {
  const filterable = props.columns.filter((column) => column.filterField && column.filterOperators);
  const [rows, setRows] = useState<FilterRow[]>(
    props.initialFilters.map((filter) => ({ field: filter.field, operator: filter.operator, values: filter.values })),
  );
  const [columnKeys, setColumnKeys] = useState<string[]>(props.initialColumnKeys);
  const [open, setOpen] = useState(props.initialFilters.length > 0);

  const columnFor = (field: string) => filterable.find((column) => column.filterField === field);
  const unusedFields = filterable.filter((column) => !rows.some((row) => row.field === column.filterField));

  const addRow = (field: string) => {
    const column = columnFor(field);
    if (!column?.filterOperators) return;
    setRows((current) => [...current, { field, operator: column.filterOperators![0], values: [] }]);
  };

  const updateRow = (field: string, patch: Partial<FilterRow>) => {
    setRows((current) => current.map((row) => (row.field === field ? { ...row, ...patch } : row)));
  };

  const toggleColumn = (key: string) => {
    setColumnKeys((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  };

  return (
    <form method="get" action={props.action} className="border rounded p-4 flex flex-col gap-4 text-sm">
      <input type="hidden" name="set_filter" value="1" />
      {props.queryId ? <input type="hidden" name="query_id" value={props.queryId} /> : null}
      <input type="hidden" name="sort" value={serializeSortCriteria(props.sortCriteria)} />
      <input type="hidden" name="per_page" value={props.perPage} />

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen((value) => !value)} className="font-semibold underline">
          {open ? "▼ フィルタ" : "▶ フィルタ"}
        </button>
        <span className="text-gray-500">{rows.length}件の条件</span>
      </div>

      {open ? (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const column = columnFor(row.field);
            if (!column?.filterOperators) return null;
            return (
              <div key={row.field} className="flex items-center gap-2 flex-wrap">
                <input type="hidden" name="f[]" value={row.field} />
                <span className="w-40">{column.label}</span>
                <select
                  name={`op[${row.field}]`}
                  value={row.operator}
                  onChange={(event) => updateRow(row.field, { operator: event.target.value as FilterOperator, values: [] })}
                  aria-label={`${column.label}の条件`}
                  className="border rounded px-2 py-1"
                >
                  {column.filterOperators.map((operator) => (
                    <option key={operator} value={operator}>
                      {OPERATOR_LABELS[operator] ?? operator}
                    </option>
                  ))}
                </select>
                <FilterValueInput
                  row={row}
                  column={column}
                  options={props.valueOptions[row.field] ?? []}
                  onChange={(values) => updateRow(row.field, { values })}
                />
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((item) => item.field !== row.field))}
                  className="text-red-600 underline"
                >
                  削除
                </button>
              </div>
            );
          })}

          <div className="flex items-center gap-2">
            <label htmlFor="add-filter">条件を追加:</label>
            <select
              id="add-filter"
              value=""
              onChange={(event) => event.target.value && addRow(event.target.value)}
              className="border rounded px-2 py-1"
            >
              <option value="">(選択)</option>
              {unusedFields.map((column) => (
                <option key={column.key} value={column.filterField ?? ""}>
                  {column.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">表示列</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {props.columns
            .filter((column) => !column.frozen)
            .map((column) => (
              <label key={column.key} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  name="c[]"
                  value={column.key}
                  checked={columnKeys.includes(column.key)}
                  onChange={() => toggleColumn(column.key)}
                />
                {column.label}
              </label>
            ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-6 flex-wrap">
        <label className="flex items-center gap-2">
          グループ条件:
          <select name="group_by" defaultValue={props.initialGroupBy ?? ""} className="border rounded px-2 py-1">
            <option value="">(なし)</option>
            {props.columns
              .filter((column) => column.groupable)
              .map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
          </select>
        </label>

        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">合計</legend>
          <span>合計:</span>
          {props.columns
            .filter((column) => column.totalable)
            .map((column) => (
              <label key={column.key} className="flex items-center gap-1">
                <input type="checkbox" name="t[]" value={column.key} defaultChecked={props.initialTotalableKeys.includes(column.key)} />
                {column.label}
              </label>
            ))}
        </fieldset>

        <button type="submit" className="border rounded px-3 py-1">
          適用
        </button>
      </div>
    </form>
  );
}

function FilterValueInput({
  row,
  column,
  options,
  onChange,
}: {
  row: FilterRow;
  column: QueryColumn;
  options: FilterValueOption[];
  onChange: (values: string[]) => void;
}) {
  const count = valueCount(row.operator);
  if (count === 0) return null;

  const name = `v[${row.field}][]`;
  const label = `${column.label}の値`;

  if (DAY_COUNT_OPERATORS.includes(row.operator)) {
    return (
      <input
        type="number"
        min={0}
        name={name}
        aria-label={label}
        value={row.values[0] ?? ""}
        onChange={(event) => onChange([event.target.value])}
        className="border rounded px-2 py-1 w-24"
      />
    );
  }

  if (column.filterInput === "date") {
    return (
      <>
        {Array.from({ length: count }, (_, index) => (
          <input
            key={index}
            type="date"
            name={name}
            aria-label={count === 2 ? `${label}${index + 1}` : label}
            value={row.values[index] ?? ""}
            onChange={(event) => onChange(replaceAt(row.values, index, event.target.value, count))}
            className="border rounded px-2 py-1"
          />
        ))}
      </>
    );
  }

  if (column.filterInput === "number") {
    return (
      <>
        {Array.from({ length: count }, (_, index) => (
          <input
            key={index}
            type="number"
            step="any"
            name={name}
            aria-label={count === 2 ? `${label}${index + 1}` : label}
            value={row.values[index] ?? ""}
            onChange={(event) => onChange(replaceAt(row.values, index, event.target.value, count))}
            className="border rounded px-2 py-1 w-28"
          />
        ))}
      </>
    );
  }

  if (column.filterInput === "text") {
    return (
      <input
        type="text"
        name={name}
        aria-label={label}
        value={row.values[0] ?? ""}
        onChange={(event) => onChange([event.target.value])}
        className="border rounded px-2 py-1"
      />
    );
  }

  // Everything else is a value list — Redmine's `=` accepts several at once (status_id=1|2).
  return (
    <select
      multiple
      name={name}
      aria-label={label}
      value={row.values}
      onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}
      className="border rounded px-2 py-1 min-w-48"
      size={Math.min(options.length || 1, 5)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function replaceAt(values: string[], index: number, value: string, length: number): string[] {
  const next = Array.from({ length }, (_, position) => values[position] ?? "");
  next[index] = value;
  return next;
}
