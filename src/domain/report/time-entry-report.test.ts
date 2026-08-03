import { describe, expect, it } from "bun:test";
import { buildTimeReport, type TimeReportEntryInput } from "./time-entry-report";

function entry(overrides: Partial<TimeReportEntryInput>): TimeReportEntryInput {
  return {
    spentOn: "2026-08-01",
    hours: 1,
    userId: "user-1",
    activityId: "activity-1",
    issueId: null,
    ...overrides,
  };
}

describe("buildTimeReport", () => {
  it("returns an empty report for no entries", () => {
    const report = buildTimeReport([], "user", "month");
    expect(report).toEqual({ periods: [], rows: [], totalsByPeriod: new Map(), grandTotal: 0 });
  });

  it("groups by user and sums hours per month period", () => {
    const entries = [
      entry({ userId: "alice", spentOn: "2026-08-01", hours: 2 }),
      entry({ userId: "alice", spentOn: "2026-08-15", hours: 3 }),
      entry({ userId: "bob", spentOn: "2026-08-02", hours: 1 }),
    ];
    const report = buildTimeReport(entries, "user", "month");
    expect(report.periods).toEqual(["2026-08"]);
    const alice = report.rows.find((row) => row.key === "alice");
    const bob = report.rows.find((row) => row.key === "bob");
    expect(alice?.hoursByPeriod.get("2026-08")).toBe(5);
    expect(alice?.total).toBe(5);
    expect(bob?.hoursByPeriod.get("2026-08")).toBe(1);
    expect(report.totalsByPeriod.get("2026-08")).toBe(6);
    expect(report.grandTotal).toBe(6);
  });

  it("spans multiple month periods, including months with no entries", () => {
    const entries = [entry({ spentOn: "2026-06-30", hours: 1 }), entry({ spentOn: "2026-08-01", hours: 2 })];
    const report = buildTimeReport(entries, "user", "month");
    expect(report.periods).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(report.totalsByPeriod.get("2026-07")).toBe(0);
  });

  it("groups by day period using the exact spent-on date", () => {
    const entries = [entry({ spentOn: "2026-08-01", hours: 1 }), entry({ spentOn: "2026-08-03", hours: 2 })];
    const report = buildTimeReport(entries, "user", "day");
    expect(report.periods).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
    expect(report.totalsByPeriod.get("2026-08-02")).toBe(0);
  });

  it("groups by ISO week period, weeks starting Monday", () => {
    // 2026-08-01 is a Saturday in ISO week 2026-W31; 2026-08-03 is the following Monday, W32.
    const entries = [entry({ spentOn: "2026-08-01", hours: 1 }), entry({ spentOn: "2026-08-03", hours: 2 })];
    const report = buildTimeReport(entries, "user", "week");
    expect(report.periods).toEqual(["2026-W31", "2026-W32"]);
    expect(report.totalsByPeriod.get("2026-W31")).toBe(1);
    expect(report.totalsByPeriod.get("2026-W32")).toBe(2);
  });

  it("groups by activity", () => {
    const entries = [
      entry({ activityId: "design", hours: 1 }),
      entry({ activityId: "development", hours: 4 }),
      entry({ activityId: "design", hours: 2 }),
    ];
    const report = buildTimeReport(entries, "activity", "month");
    expect(report.rows.find((row) => row.key === "design")?.total).toBe(3);
    expect(report.rows.find((row) => row.key === "development")?.total).toBe(4);
  });

  it("buckets entries with no linked issue under the null key when grouping by issue", () => {
    const entries = [entry({ issueId: null, hours: 1 }), entry({ issueId: "issue-1", hours: 2 })];
    const report = buildTimeReport(entries, "issue", "month");
    expect(report.rows.find((row) => row.key === null)?.total).toBe(1);
    expect(report.rows.find((row) => row.key === "issue-1")?.total).toBe(2);
  });

  it("sorts rows by key", () => {
    const entries = [entry({ userId: "carol" }), entry({ userId: "alice" }), entry({ userId: "bob" })];
    const report = buildTimeReport(entries, "user", "month");
    expect(report.rows.map((row) => row.key)).toEqual(["alice", "bob", "carol"]);
  });
});
