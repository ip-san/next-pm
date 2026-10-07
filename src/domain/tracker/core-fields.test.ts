import { describe, expect, it } from "bun:test";
import {
  disabledCoreFieldsAcross,
  enabledCoreFields,
  enabledCoreFieldsAcross,
  isCoreFieldDisabled,
  normalizeDisabledCoreFields,
  TRACKER_CORE_FIELDS,
  withoutDisabledCoreFields,
} from "./core-fields";

const bug = { disabledCoreFields: ["dueDate", "estimatedHours"] as const };
const feature = { disabledCoreFields: ["estimatedHours"] as const };

describe("enabledCoreFields", () => {
  it("is the complement of the disabled set", () => {
    const enabled = enabledCoreFields({ disabledCoreFields: [...bug.disabledCoreFields] });
    expect(enabled).not.toContain("dueDate");
    expect(enabled).not.toContain("estimatedHours");
    expect(enabled).toContain("startDate");
  });

  it("is every core field when nothing is disabled", () => {
    expect(enabledCoreFields({ disabledCoreFields: [] })).toEqual([...TRACKER_CORE_FIELDS]);
  });
});

describe("isCoreFieldDisabled", () => {
  it("answers per field", () => {
    expect(isCoreFieldDisabled({ disabledCoreFields: [...bug.disabledCoreFields] }, "dueDate")).toBe(true);
    expect(isCoreFieldDisabled({ disabledCoreFields: [...bug.disabledCoreFields] }, "startDate")).toBe(false);
  });
});

describe("disabledCoreFieldsAcross", () => {
  it("intersects, so a field stays available while any tracker wants it", () => {
    const trackers = [
      { disabledCoreFields: [...bug.disabledCoreFields] },
      { disabledCoreFields: [...feature.disabledCoreFields] },
    ];
    expect(disabledCoreFieldsAcross(trackers)).toEqual(["estimatedHours"]);
    expect(enabledCoreFieldsAcross(trackers)).toContain("dueDate");
  });

  it("disables nothing for an empty tracker set", () => {
    expect(disabledCoreFieldsAcross([])).toEqual([]);
    expect(enabledCoreFieldsAcross([])).toEqual([...TRACKER_CORE_FIELDS]);
  });
});

describe("normalizeDisabledCoreFields", () => {
  it("drops unknown names and returns the canonical order", () => {
    expect(normalizeDisabledCoreFields(["dueDate", "nonsense", "description"])).toEqual(["dueDate", "description"]);
  });
});

describe("withoutDisabledCoreFields", () => {
  it("drops the attributes the tracker switched off", () => {
    const attributes: { subject: string; dueDate?: string; startDate?: string } = {
      subject: "x",
      dueDate: "2026-01-01",
      startDate: "2026-01-01",
    };
    expect(withoutDisabledCoreFields({ disabledCoreFields: ["dueDate"] }, attributes)).toEqual({
      subject: "x",
      startDate: "2026-01-01",
    });
  });
});
