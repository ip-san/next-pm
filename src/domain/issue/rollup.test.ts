import { describe, expect, it } from "bun:test";
import { recalculateParentAttributes, type RollupChild, type RollupOptions } from "./rollup";

function child(overrides: Partial<RollupChild> = {}): RollupChild {
  return {
    startDate: null,
    dueDate: null,
    doneRatio: 0,
    totalEstimatedHours: 0,
    isClosed: false,
    priorityPosition: 2,
    priorityId: "normal",
    ...overrides,
  };
}

const allOff: RollupOptions = {
  dates: false,
  priority: false,
  doneRatio: false,
  doneRatioFixedByStatus: false,
  defaultPriorityId: null,
};

describe("recalculateParentAttributes", () => {
  it("returns nothing for an issue with no children", () => {
    expect(recalculateParentAttributes([], { ...allOff, dates: true, priority: true, doneRatio: true })).toEqual({});
  });

  it("returns nothing when no attribute is derived", () => {
    expect(recalculateParentAttributes([child({ startDate: "2026-01-01" })], allOff)).toEqual({});
  });

  describe("dates", () => {
    it("spans the earliest start and the latest due of the children", () => {
      const changes = recalculateParentAttributes(
        [child({ startDate: "2026-03-01", dueDate: "2026-03-10" }), child({ startDate: "2026-02-01", dueDate: "2026-04-01" })],
        { ...allOff, dates: true },
      );
      expect(changes).toEqual({ startDate: "2026-02-01", dueDate: "2026-04-01" });
    });

    it("clears both when no child has dates", () => {
      expect(recalculateParentAttributes([child()], { ...allOff, dates: true })).toEqual({ startDate: null, dueDate: null });
    });

    it("swaps an inverted pair, as Redmine does", () => {
      const changes = recalculateParentAttributes([child({ startDate: "2026-05-01" }), child({ dueDate: "2026-01-01" })], {
        ...allOff,
        dates: true,
      });
      expect(changes).toEqual({ startDate: "2026-01-01", dueDate: "2026-05-01" });
    });
  });

  describe("priority", () => {
    it("takes the highest priority among open children", () => {
      const changes = recalculateParentAttributes(
        [child({ priorityPosition: 2, priorityId: "normal" }), child({ priorityPosition: 5, priorityId: "urgent" })],
        { ...allOff, priority: true },
      );
      expect(changes.priorityId).toBe("urgent");
    });

    it("ignores closed children when picking the highest", () => {
      const changes = recalculateParentAttributes(
        [child({ priorityPosition: 2, priorityId: "normal" }), child({ priorityPosition: 9, priorityId: "urgent", isClosed: true })],
        { ...allOff, priority: true },
      );
      expect(changes.priorityId).toBe("normal");
    });

    it("falls back to the default priority once every child is closed", () => {
      const changes = recalculateParentAttributes([child({ isClosed: true, priorityId: "urgent", priorityPosition: 9 })], {
        ...allOff,
        priority: true,
        defaultPriorityId: "normal",
      });
      expect(changes.priorityId).toBe("normal");
    });

    it("leaves the priority alone when all children are closed and there is no default", () => {
      const changes = recalculateParentAttributes([child({ isClosed: true })], { ...allOff, priority: true });
      expect(changes.priorityId).toBeUndefined();
    });
  });

  describe("done ratio", () => {
    it("averages unweighted when no child carries an estimate", () => {
      const changes = recalculateParentAttributes([child({ doneRatio: 100 }), child({ doneRatio: 0 })], {
        ...allOff,
        doneRatio: true,
      });
      expect(changes.doneRatio).toBe(50);
    });

    it("weights the average by each child's total estimated hours", () => {
      // 30h at 100% and 10h at 0% => 3000/40 = 75
      const changes = recalculateParentAttributes(
        [child({ doneRatio: 100, totalEstimatedHours: 30 }), child({ doneRatio: 0, totalEstimatedHours: 10 })],
        { ...allOff, doneRatio: true },
      );
      expect(changes.doneRatio).toBe(75);
    });

    it("counts a closed child as 100% regardless of its stored ratio", () => {
      const changes = recalculateParentAttributes([child({ doneRatio: 0, isClosed: true }), child({ doneRatio: 0 })], {
        ...allOff,
        doneRatio: true,
      });
      expect(changes.doneRatio).toBe(50);
    });

    it("weights an estimate-less child at the average of those that have one", () => {
      // weighted average of estimates = 10; the estimate-less child is treated as 10h.
      const changes = recalculateParentAttributes(
        [child({ doneRatio: 100, totalEstimatedHours: 10 }), child({ doneRatio: 0 })],
        { ...allOff, doneRatio: true },
      );
      expect(changes.doneRatio).toBe(50);
    });

    it("floors the result rather than rounding", () => {
      const changes = recalculateParentAttributes([child({ doneRatio: 100 }), child({ doneRatio: 0 }), child({ doneRatio: 0 })], {
        ...allOff,
        doneRatio: true,
      });
      expect(changes.doneRatio).toBe(33);
    });

    it("leaves done_ratio alone when the parent's status fixes it", () => {
      const changes = recalculateParentAttributes([child({ doneRatio: 100 })], {
        ...allOff,
        doneRatio: true,
        doneRatioFixedByStatus: true,
      });
      expect(changes.doneRatio).toBeUndefined();
    });
  });
});
