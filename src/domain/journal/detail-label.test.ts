import { describe, expect, it } from "bun:test";
import { describeJournalDetail, summariseJournalDetail, type JournalDetailNames } from "./detail-label";
import type { JournalDetail } from "./entity";

const names: JournalDetailNames = {
  customFields: new Map([["cf-1", "Severity"]]),
  values: new Map([
    ["11111111-1111-4111-8111-111111111111", "New"],
    ["22222222-2222-4222-8222-222222222222", "Closed"],
  ]),
};

function detail(overrides: Partial<JournalDetail>): JournalDetail {
  return { property: "attr", fieldName: "statusId", oldValue: null, newValue: null, ...overrides };
}

describe("describeJournalDetail", () => {
  it("names the attribute and resolves both ids", () => {
    const result = describeJournalDetail(
      detail({
        fieldName: "statusId",
        oldValue: "11111111-1111-4111-8111-111111111111",
        newValue: "22222222-2222-4222-8222-222222222222",
      }),
      names,
    );
    expect(result).toEqual({ kind: "changed", label: "ステータス", from: "New", to: "Closed" });
  });

  it("falls back to a short id for a value the viewer was not shown", () => {
    // Resolving blindly would leak: a move journal's project id or a parent id can point at
    // something this viewer cannot open.
    const result = describeJournalDetail(
      detail({ fieldName: "parentId", oldValue: null, newValue: "99999999-9999-4999-8999-999999999999" }),
      names,
    );
    expect(result).toEqual({ kind: "changed", label: "親チケット", from: "(なし)", to: "#99999999" });
  });

  it("leaves a plain value alone rather than treating it as an id", () => {
    const result = describeJournalDetail(detail({ fieldName: "subject", oldValue: "Before", newValue: "After" }), names);
    expect(result).toEqual({ kind: "changed", label: "件名", from: "Before", to: "After" });
  });

  it("reports a description change as updated, without the two documents", () => {
    const result = describeJournalDetail(detail({ fieldName: "description", oldValue: "a", newValue: "b" }), names);
    expect(result).toEqual({ kind: "updated", label: "説明" });
  });

  it("reads an attachment addition as a filename, not an id", () => {
    // Regression: these rendered as "<uuid>: (なし) → foo.png".
    const result = describeJournalDetail(
      detail({ property: "attachment", fieldName: "33333333-3333-4333-8333-333333333333", oldValue: null, newValue: "foo.png" }),
      names,
    );
    expect(result).toEqual({ kind: "added", label: "ファイル", value: "foo.png" });
  });

  it("reads an attachment removal from the old value", () => {
    const result = describeJournalDetail(
      detail({ property: "attachment", fieldName: "33333333-3333-4333-8333-333333333333", oldValue: "gone.png", newValue: null }),
      names,
    );
    expect(result).toEqual({ kind: "removed", label: "ファイル", value: "gone.png" });
  });

  it("names a custom field by its own name", () => {
    const result = describeJournalDetail(detail({ property: "cf", fieldName: "cf-1", oldValue: "Low", newValue: "High" }), names);
    expect(result).toEqual({ kind: "changed", label: "Severity", from: "Low", to: "High" });
  });

  it("falls back to a short id for a custom field that no longer exists", () => {
    const result = describeJournalDetail(detail({ property: "cf", fieldName: "cf-gone", oldValue: "a", newValue: "b" }), names);
    expect(result.label).toBe("#cf-gone");
  });

  it("renders the private flag as a word rather than a boolean literal", () => {
    const result = describeJournalDetail(detail({ fieldName: "isPrivate", oldValue: "false", newValue: "true" }), names);
    expect(result).toEqual({ kind: "changed", label: "プライベート", from: "いいえ", to: "はい" });
  });

  it("writes the labels in the locale it is asked for, and in Japanese by default", () => {
    const change = detail({ fieldName: "isPrivate", oldValue: "false", newValue: "true" });
    expect(describeJournalDetail(change, names)).toEqual({ kind: "changed", label: "プライベート", from: "いいえ", to: "はい" });
    expect(describeJournalDetail(change, names, "en")).toEqual({ kind: "changed", label: "Private", from: "No", to: "Yes" });
    expect(describeJournalDetail(detail({ fieldName: "description", oldValue: "a", newValue: "b" }), names, "en")).toEqual({
      kind: "updated",
      label: "Description",
    });
  });

  it("summarises a description in the locale it is asked for", () => {
    const changed = describeJournalDetail(detail({ fieldName: "dueDate", oldValue: null, newValue: "2026-10-01" }), names, "en");
    expect(summariseJournalDetail(changed, "en")).toBe("Due date: (None) → 2026-10-01");
    expect(summariseJournalDetail(describeJournalDetail(detail({ fieldName: "dueDate", oldValue: null, newValue: "2026-10-01" }), names))).toBe(
      "期日: (なし) → 2026-10-01",
    );
  });
});
