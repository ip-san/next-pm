import { describe, expect, it } from "bun:test";
import { buildGanttRows, buildMonthTicks, effectiveIssueRange, monthsWindow } from "./layout";
import type { Issue } from "@/domain/issue/entity";

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "issue-1",
    projectId: "project-1",
    trackerId: "tracker-1",
    statusId: "status-1",
    priorityId: "priority-1",
    subject: "Test issue",
    description: "",
    authorId: "user-1",
    assignedToId: null,
    assignedToType: null,
    parentId: null,
    fixedVersionId: null,
    categoryId: null,
    isPrivate: false,
    doneRatio: 0,
    estimatedHours: null,
    startDate: null,
    dueDate: null,
    lockVersion: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("effectiveIssueRange", () => {
  it("uses both dates when present", () => {
    expect(effectiveIssueRange(issue({ startDate: "2026-08-01", dueDate: "2026-08-05" }))).toEqual({
      start: "2026-08-01",
      end: "2026-08-05",
    });
  });

  it("falls back to the other date when one is missing", () => {
    expect(effectiveIssueRange(issue({ startDate: "2026-08-01", dueDate: null }))).toEqual({
      start: "2026-08-01",
      end: "2026-08-01",
    });
    expect(effectiveIssueRange(issue({ startDate: null, dueDate: "2026-08-05" }))).toEqual({
      start: "2026-08-05",
      end: "2026-08-05",
    });
  });

  it("returns null when neither date is present", () => {
    expect(effectiveIssueRange(issue({ startDate: null, dueDate: null }))).toBeNull();
  });
});

describe("buildGanttRows", () => {
  const window = { start: "2026-08-01", end: "2026-08-31" };

  it("excludes issues with no date info", () => {
    const rows = buildGanttRows([issue({ startDate: null, dueDate: null })], window);
    expect(rows).toEqual([]);
  });

  it("excludes issues entirely outside the window", () => {
    const rows = buildGanttRows([issue({ startDate: "2026-06-01", dueDate: "2026-06-05" })], window);
    expect(rows).toEqual([]);
  });

  it("positions a bar fully inside the window", () => {
    // Aug 1-31 is a 31-day window; a bar on Aug 11-15 (5 days) starts 10 days in.
    const rows = buildGanttRows([issue({ id: "a", startDate: "2026-08-11", dueDate: "2026-08-15" })], window);
    expect(rows).toHaveLength(1);
    expect(rows[0].leftPercent).toBeCloseTo((10 / 31) * 100, 5);
    expect(rows[0].widthPercent).toBeCloseTo((5 / 31) * 100, 5);
  });

  it("clamps a bar that starts before the window to 0%", () => {
    const rows = buildGanttRows([issue({ id: "a", startDate: "2026-07-25", dueDate: "2026-08-05" })], window);
    expect(rows).toHaveLength(1);
    expect(rows[0].leftPercent).toBe(0);
  });

  it("orders children directly beneath their parent, indented", () => {
    const parent = issue({ id: "parent", startDate: "2026-08-01", dueDate: "2026-08-10" });
    const child = issue({ id: "child", parentId: "parent", startDate: "2026-08-02", dueDate: "2026-08-03" });
    const unrelated = issue({ id: "other", startDate: "2026-08-05", dueDate: "2026-08-06" });
    const rows = buildGanttRows([unrelated, child, parent], window);
    expect(rows.map((r) => r.issue.id)).toEqual(["parent", "child", "other"]);
    expect(rows.find((r) => r.issue.id === "parent")?.depth).toBe(0);
    expect(rows.find((r) => r.issue.id === "child")?.depth).toBe(1);
  });

  it("treats a parent outside the visible set as a root", () => {
    const child = issue({ id: "child", parentId: "missing-parent", startDate: "2026-08-02", dueDate: "2026-08-03" });
    const rows = buildGanttRows([child], window);
    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
  });
});

describe("monthsWindow", () => {
  it("spans the given number of calendar months from the start month", () => {
    expect(monthsWindow(2026, 8, 3)).toEqual({ start: "2026-08-01", end: "2026-10-31" });
  });

  it("rolls over the year boundary", () => {
    expect(monthsWindow(2026, 12, 2)).toEqual({ start: "2026-12-01", end: "2027-01-31" });
  });

  it("handles a single-month span", () => {
    expect(monthsWindow(2026, 2, 1)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("buildMonthTicks", () => {
  it("emits one tick per month touched by the window", () => {
    const ticks = buildMonthTicks({ start: "2026-07-15", end: "2026-09-10" });
    expect(ticks.map((t) => t.label)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(ticks[0].leftPercent).toBe(0);
  });

  it("positions a full-month window's single tick at 0%", () => {
    const ticks = buildMonthTicks({ start: "2026-08-01", end: "2026-08-31" });
    expect(ticks).toEqual([{ label: "2026-08", leftPercent: 0 }]);
  });
});
