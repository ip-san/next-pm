import { describe, expect, it } from "bun:test";
import {
  buildVersionRows,
  ganttTimelineWidth,
  GANTT_MONTHS_DEFAULT,
  GANTT_ZOOM_DEFAULT,
  monthsWindow,
  resolveGanttMonths,
  resolveGanttZoom,
} from "./layout";

describe("resolveGanttZoom and resolveGanttMonths", () => {
  it("keeps values inside the range and falls back to the defaults outside it", () => {
    expect(resolveGanttZoom("4")).toBe(4);
    expect(resolveGanttZoom("5")).toBe(GANTT_ZOOM_DEFAULT);
    expect(resolveGanttZoom("0")).toBe(GANTT_ZOOM_DEFAULT);
    expect(resolveGanttZoom("abc")).toBe(GANTT_ZOOM_DEFAULT);
    expect(resolveGanttMonths("12")).toBe(12);
    expect(resolveGanttMonths("13")).toBe(GANTT_MONTHS_DEFAULT);
  });
});

describe("ganttTimelineWidth", () => {
  it("is one zoom-width per day of the window, as Redmine's g_width", () => {
    const window = monthsWindow(2026, 1, 1); // January: 31 days
    expect(ganttTimelineWidth(window, 2)).toBe(62);
  });
});

describe("buildVersionRows", () => {
  const window = monthsWindow(2026, 1, 3);
  const version = { id: "v-1", name: "1.0", effectiveDate: "2026-02-10" };

  it("starts the bar at the earliest visible issue start and ends at the effective date", () => {
    const rows = buildVersionRows(
      [version],
      [
        { fixedVersionId: "v-1", startDate: "2026-01-20", dueDate: "2026-01-25" },
        { fixedVersionId: "v-1", startDate: "2026-02-01", dueDate: "2026-02-05" },
      ],
      window,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].leftPercent).toBeGreaterThan(0);
    expect(rows[0].widthPercent).toBeGreaterThan(0);
  });

  it("uses the effective date alone when no visible issue is dated", () => {
    const rows = buildVersionRows([version], [{ fixedVersionId: "v-1", startDate: null, dueDate: null }], window);
    expect(rows).toHaveLength(1);
  });

  it("skips a version without an effective date, and one outside the window", () => {
    expect(buildVersionRows([{ id: "v-2", name: "x", effectiveDate: null }], [], window)).toHaveLength(0);
    expect(buildVersionRows([{ id: "v-3", name: "y", effectiveDate: "2030-01-01" }], [], window)).toHaveLength(0);
  });
});
