import { describe, expect, it, mock } from "bun:test";
import { validateTimeEntryCustomFieldValues } from "./set-time-entry-custom-field-values";
import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";

function field(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "cf-1",
    name: "Billable",
    customizedType: "TimeEntry",
    fieldFormat: "list",
    isRequired: false,
    defaultValue: null,
    visible: true,
    roleIds: [],
    possibleValues: ["yes", "no"],
    position: 0,
    trackerIds: [],
    ...overrides,
  };
}

function repo(fields: CustomField[]): CustomFieldRepository {
  return {
    listAll: mock(async () => fields),
    listForTracker: mock(async () => fields),
    listForCustomizedType: mock(async () => fields),
    findById: mock(async () => fields[0] ?? null),
    create: mock(async (f) => ({ ...f, id: "new" })),
  };
}

describe("validateTimeEntryCustomFieldValues", () => {
  it("accepts a value in the field's possible values", async () => {
    expect(await validateTimeEntryCustomFieldValues(repo([field()]), { "cf-1": "yes" }, { full: true })).toEqual({});
  });

  it("reports a value outside the field's possible values", async () => {
    const errors = await validateTimeEntryCustomFieldValues(repo([field()]), { "cf-1": "maybe" }, { full: true });
    expect(errors["cf-1"]).toContain("許可された値");
  });

  it("reports a required field the caller omitted entirely when validating a creation", async () => {
    const errors = await validateTimeEntryCustomFieldValues(repo([field({ isRequired: true })]), {}, { full: true });
    expect(errors["cf-1"]).toContain("必須");
  });

  it("ignores a required field the caller omitted when validating a partial edit", async () => {
    expect(await validateTimeEntryCustomFieldValues(repo([field({ isRequired: true })]), {}, { full: false })).toEqual({});
  });

  it("still reports a required field explicitly blanked on a partial edit", async () => {
    const errors = await validateTimeEntryCustomFieldValues(repo([field({ isRequired: true })]), { "cf-1": "" }, { full: false });
    expect(errors["cf-1"]).toContain("必須");
  });

  it("accepts an optional field left blank", async () => {
    expect(await validateTimeEntryCustomFieldValues(repo([field()]), { "cf-1": "" }, { full: true })).toEqual({});
  });

  it("ignores values for fields that don't apply to time entries", async () => {
    expect(await validateTimeEntryCustomFieldValues(repo([]), { "cf-other": "anything" }, { full: true })).toEqual({});
  });
});
