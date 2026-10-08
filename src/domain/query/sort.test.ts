import { describe, expect, it } from "bun:test";
import type { QueryColumn } from "./columns";
import { normalizeSortCriteria, parseSortCriteria, resolveSortCriteria, serializeSortCriteria, toggleSortCriteria } from "./sort";

function column(key: string, defaultOrder: "asc" | "desc" = "asc", sortable = true): QueryColumn {
  return { key, filterField: null, label: key, sortable, groupable: false, totalable: false, defaultOrder, filterOperators: null, filterInput: null };
}

describe("parseSortCriteria", () => {
  it("reads Redmine's 'key:desc,key2' form, defaulting to asc", () => {
    expect(parseSortCriteria("status:desc,subject")).toEqual([
      ["status", "desc"],
      ["subject", "asc"],
    ]);
  });

  it("returns nothing for an empty parameter", () => {
    expect(parseSortCriteria(undefined)).toEqual([]);
    expect(parseSortCriteria("")).toEqual([]);
  });

  it("truncates to three criteria, as SortCriteria#normalize! does", () => {
    expect(parseSortCriteria("a,b,c,d")).toHaveLength(3);
  });

  it("drops duplicate keys, keeping the first", () => {
    expect(parseSortCriteria("a:desc,a,b")).toEqual([
      ["a", "desc"],
      ["b", "asc"],
    ]);
  });
});

describe("serializeSortCriteria", () => {
  it("leaves asc implicit, mirroring SortCriteria#to_param", () => {
    expect(
      serializeSortCriteria([
        ["status", "desc"],
        ["subject", "asc"],
      ]),
    ).toBe("status:desc,subject");
  });

  it("round-trips through parseSortCriteria", () => {
    const criteria = normalizeSortCriteria([
      ["a", "desc"],
      ["b", "asc"],
    ]);
    expect(parseSortCriteria(serializeSortCriteria(criteria))).toEqual(criteria);
  });
});

describe("toggleSortCriteria", () => {
  it("uses the column's default order on its first click", () => {
    expect(toggleSortCriteria([], column("created_on", "desc"))).toEqual([["created_on", "desc"]]);
    expect(toggleSortCriteria([], column("subject"))).toEqual([["subject", "asc"]]);
  });

  it("flips the direction when the column is already primary", () => {
    expect(toggleSortCriteria([["subject", "asc"]], column("subject"))).toEqual([["subject", "desc"]]);
    expect(toggleSortCriteria([["subject", "desc"]], column("subject"))).toEqual([["subject", "asc"]]);
  });

  // SortCriteria#add! prepends, so the previous key becomes the secondary sort.
  it("promotes a new column to primary and keeps the rest as secondary keys", () => {
    expect(toggleSortCriteria([["subject", "asc"]], column("status"))).toEqual([
      ["status", "asc"],
      ["subject", "asc"],
    ]);
  });

  it("moves an already-secondary column to the front without duplicating it", () => {
    const result = toggleSortCriteria(
      [
        ["status", "asc"],
        ["subject", "asc"],
      ],
      column("subject"),
    );
    expect(result).toEqual([
      ["subject", "asc"],
      ["status", "asc"],
    ]);
  });
});

describe("resolveSortCriteria", () => {
  const columns = [column("subject"), column("description", "asc", false)];

  it("drops criteria naming an unknown or unsortable column", () => {
    expect(resolveSortCriteria(columns, [["description", "asc"]])).toEqual([["id", "desc"]]);
    expect(resolveSortCriteria(columns, [["cf_gone", "asc"]])).toEqual([["id", "desc"]]);
  });

  it("falls back to Redmine's default sort when nothing is left", () => {
    expect(resolveSortCriteria(columns, [])).toEqual([["id", "desc"]]);
  });

  it("keeps the valid criteria otherwise", () => {
    expect(resolveSortCriteria(columns, [["subject", "desc"]])).toEqual([["subject", "desc"]]);
  });
});
