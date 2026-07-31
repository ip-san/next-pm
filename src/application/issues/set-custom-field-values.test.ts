import { describe, expect, it, mock } from "bun:test";
import { setIssueCustomFieldValues, CustomFieldValidationError } from "./set-custom-field-values";
import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

function makeField(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "field-1",
    name: "Severity",
    fieldFormat: "list",
    isRequired: false,
    defaultValue: null,
    possibleValues: ["Low", "High"],
    position: 1,
    trackerIds: ["tracker-1"],
    ...overrides,
  };
}

function makeRepos(fields: CustomField[]) {
  const customFieldRepository: CustomFieldRepository = {
    listAll: mock(async () => fields),
    listForTracker: mock(async () => fields),
    findById: mock(async () => fields[0] ?? null),
    create: mock(async (f) => ({ ...f, id: "new-field" })),
  };
  const customValueRepository: CustomValueRepository = {
    listForCustomized: mock(async () => []),
    set: mock(async (customFieldId, customizedType, customizedId, value) => ({
      id: "cv-1",
      customFieldId,
      customizedType,
      customizedId,
      value,
    })),
  };
  return { customFieldRepository, customValueRepository };
}

describe("setIssueCustomFieldValues", () => {
  it("persists a valid value for a field present in rawValues", async () => {
    const repos = makeRepos([makeField()]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", { "field-1": "High" });
    expect(repos.customValueRepository.set).toHaveBeenCalledWith("field-1", "Issue", "issue-1", "High");
  });

  it("throws with a field-level error and writes nothing when a value is invalid", async () => {
    const repos = makeRepos([makeField()]);
    await expect(
      setIssueCustomFieldValues(repos, "tracker-1", "issue-1", { "field-1": "Unknown" }),
    ).rejects.toThrow(CustomFieldValidationError);
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("does not touch a required field that isn't present in rawValues (partial-update semantics)", async () => {
    // Regression: a PATCH updating one field must not be rejected because some other
    // already-set required custom field wasn't resent in this call.
    const repos = makeRepos([makeField({ id: "field-1", isRequired: true }), makeField({ id: "field-2", name: "Other" })]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", { "field-2": "" });
    expect(repos.customValueRepository.set).toHaveBeenCalledTimes(1);
    expect(repos.customValueRepository.set).toHaveBeenCalledWith("field-2", "Issue", "issue-1", null);
  });

  it("treats a required field as invalid when explicitly present but blank", async () => {
    const repos = makeRepos([makeField({ isRequired: true })]);
    await expect(setIssueCustomFieldValues(repos, "tracker-1", "issue-1", { "field-1": "" })).rejects.toThrow(
      CustomFieldValidationError,
    );
  });

  it("silently ignores a field id not applicable to this tracker", async () => {
    const repos = makeRepos([]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", { "not-applicable": "value" });
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("writes nothing when rawValues is empty", async () => {
    const repos = makeRepos([makeField()]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", {});
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("reports all field errors together, not just the first", async () => {
    const repos = makeRepos([
      makeField({ id: "field-1", isRequired: true }),
      makeField({ id: "field-2", isRequired: true, name: "Other" }),
    ]);
    try {
      await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", { "field-1": "", "field-2": "" });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomFieldValidationError);
      expect(Object.keys((error as CustomFieldValidationError).fieldErrors)).toEqual(["field-1", "field-2"]);
    }
  });
});
