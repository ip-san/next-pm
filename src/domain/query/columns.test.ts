import { describe, expect, it } from "bun:test";
import {
  DEFAULT_GLOBAL_ISSUE_COLUMN_KEYS,
  DEFAULT_ISSUE_COLUMN_KEYS,
  findColumn,
  findColumnByFilterField,
  issueQueryColumns,
  resolveDisplayColumns,
} from "./columns";

const noCustomFields = { customFields: [], canViewTimeEntries: false };

describe("issueQueryColumns", () => {
  it("leaves the project column out of a project-scoped list", () => {
    const columns = issueQueryColumns(noCustomFields);
    expect(findColumn(columns, "project")).toBeUndefined();
    expect(findColumnByFilterField(columns, "project_id")).toBeUndefined();
  });

  it("adds the project column and its filter on a cross-project list", () => {
    const columns = issueQueryColumns({ ...noCustomFields, crossProject: true });
    const project = findColumn(columns, "project");
    expect(project?.groupable).toBe(true);
    expect(project?.sortable).toBe(true);
    expect(findColumnByFilterField(columns, "project_id")?.key).toBe("project");
  });

  it("puts the project column right after the frozen # column", () => {
    const columns = issueQueryColumns({ ...noCustomFields, crossProject: true });
    expect(columns.map((column) => column.key).slice(0, 2)).toEqual(["id", "project"]);
  });

  it("drops the category filter on a cross-project list but keeps the column", () => {
    // Redmine: `add_available_filter("category_id", ...) if project` — categories belong to
    // one project, so there is no cross-project value set to filter on.
    const columns = issueQueryColumns({ ...noCustomFields, crossProject: true });
    expect(findColumn(columns, "category")).toBeDefined();
    expect(findColumn(columns, "category")?.filterField).toBeNull();
    expect(findColumnByFilterField(columns, "category_id")).toBeUndefined();
  });

  it("keeps the category filter on a project-scoped list", () => {
    expect(findColumnByFilterField(issueQueryColumns(noCustomFields), "category_id")?.key).toBe("category");
  });

  it("offers spent_hours only to a viewer who may see time entries", () => {
    expect(findColumn(issueQueryColumns(noCustomFields), "spent_hours")).toBeUndefined();
    expect(findColumn(issueQueryColumns({ ...noCustomFields, canViewTimeEntries: true }), "spent_hours")).toBeDefined();
  });
});

describe("resolveDisplayColumns", () => {
  const columns = issueQueryColumns({ ...noCustomFields, crossProject: true });

  it("falls back to the given defaults when nothing is selected", () => {
    const keys = resolveDisplayColumns(columns, [], DEFAULT_GLOBAL_ISSUE_COLUMN_KEYS).map((column) => column.key);
    expect(keys).toEqual(["id", ...DEFAULT_GLOBAL_ISSUE_COLUMN_KEYS]);
  });

  it("defaults to the project-scoped column set when no defaults are passed", () => {
    const keys = resolveDisplayColumns(columns, []).map((column) => column.key);
    expect(keys).toEqual(["id", ...DEFAULT_ISSUE_COLUMN_KEYS]);
  });

  it("keeps an explicit selection and still prepends the frozen column", () => {
    expect(resolveDisplayColumns(columns, ["subject"]).map((column) => column.key)).toEqual(["id", "subject"]);
  });
});
