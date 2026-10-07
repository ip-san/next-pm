import { describe, expect, it } from "bun:test";
import { canEditTimeEntry, isTimeEntryVisible, seesOnlyOwnTimeEntries } from "./visibility";

const own = { timeEntriesVisibility: "own" as const };
const all = { timeEntriesVisibility: "all" as const };

describe("isTimeEntryVisible", () => {
  it("shows every entry to a role with 'all'", () => {
    expect(isTimeEntryVisible({ userId: "other" }, "me", [all])).toBe(true);
  });

  it("hides another user's entry from a role with 'own'", () => {
    expect(isTimeEntryVisible({ userId: "other" }, "me", [own])).toBe(false);
  });

  it("shows the viewer's own entry to a role with 'own'", () => {
    expect(isTimeEntryVisible({ userId: "me" }, "me", [own])).toBe(true);
  });

  it("hides everything from an anonymous viewer under 'own'", () => {
    expect(isTimeEntryVisible({ userId: "me" }, null, [own])).toBe(false);
  });

  it("takes the most permissive of several roles", () => {
    expect(isTimeEntryVisible({ userId: "other" }, "me", [own, all])).toBe(true);
  });

  it("hides everything when the actor holds no role at all", () => {
    expect(isTimeEntryVisible({ userId: "me" }, "me", [])).toBe(false);
  });
});

describe("canEditTimeEntry", () => {
  const base = { visible: true, canEditTimeEntries: false, canEditOwnTimeEntries: false };

  it("refuses when the entry is not visible, even with edit_time_entries", () => {
    expect(
      canEditTimeEntry({ ...base, entry: { userId: "other" }, userId: "me", visible: false, canEditTimeEntries: true }),
    ).toBe(false);
  });

  it("allows editing anyone's entry with edit_time_entries", () => {
    expect(canEditTimeEntry({ ...base, entry: { userId: "other" }, userId: "me", canEditTimeEntries: true })).toBe(true);
  });

  it("allows editing one's own entry with edit_own_time_entries", () => {
    expect(canEditTimeEntry({ ...base, entry: { userId: "me" }, userId: "me", canEditOwnTimeEntries: true })).toBe(true);
  });

  it("refuses another user's entry with only edit_own_time_entries", () => {
    expect(canEditTimeEntry({ ...base, entry: { userId: "other" }, userId: "me", canEditOwnTimeEntries: true })).toBe(false);
  });

  it("refuses with neither permission", () => {
    expect(canEditTimeEntry({ ...base, entry: { userId: "me" }, userId: "me" })).toBe(false);
  });

  it("refuses an anonymous actor", () => {
    expect(canEditTimeEntry({ ...base, entry: { userId: "me" }, userId: null, canEditOwnTimeEntries: true })).toBe(false);
  });
});

describe("seesOnlyOwnTimeEntries", () => {
  it("narrows when every role says own", () => {
    expect(seesOnlyOwnTimeEntries([{ timeEntriesVisibility: "own" }, { timeEntriesVisibility: "own" }])).toBe(true);
  });

  it("does not narrow as soon as one role says all", () => {
    expect(seesOnlyOwnTimeEntries([{ timeEntriesVisibility: "own" }, { timeEntriesVisibility: "all" }])).toBe(false);
  });

  it("narrows an actor with no roles at all", () => {
    expect(seesOnlyOwnTimeEntries([])).toBe(true);
  });
});
