import { describe, expect, it, mock } from "bun:test";
import { setProjectCustomFieldValues, CustomFieldValidationError } from "./set-project-custom-field-values";
import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";

function makeField(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "field-1",
    name: "Budget code",
    customizedType: "Project",
    fieldFormat: "string",
    isRequired: false,
    defaultValue: null,
    possibleValues: [],
    position: 1,
    trackerIds: [],
    ...overrides,
  };
}

function makeRepos(fields: CustomField[]) {
  const customFieldRepository: CustomFieldRepository = {
    listAll: mock(async () => fields),
    listForTracker: mock(async () => []),
    listForCustomizedType: mock(async () => fields),
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

describe("setProjectCustomFieldValues", () => {
  it("persists a valid value for a field present in rawValues", async () => {
    const repos = makeRepos([makeField()]);
    await setProjectCustomFieldValues(repos, "project-1", { "field-1": "PRJ-42" });
    expect(repos.customValueRepository.set).toHaveBeenCalledWith("field-1", "Project", "project-1", "PRJ-42");
    expect(repos.customFieldRepository.listForCustomizedType).toHaveBeenCalledWith("Project");
  });

  it("throws with a field-level error and writes nothing when a value is invalid", async () => {
    const repos = makeRepos([makeField({ fieldFormat: "int" })]);
    await expect(
      setProjectCustomFieldValues(repos, "project-1", { "field-1": "not-a-number" }),
    ).rejects.toThrow(CustomFieldValidationError);
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("writes nothing when rawValues is empty", async () => {
    const repos = makeRepos([makeField()]);
    await setProjectCustomFieldValues(repos, "project-1", {});
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });
});
