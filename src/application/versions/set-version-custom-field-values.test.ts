import { describe, expect, it, mock } from "bun:test";
import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";
import { CustomFieldValidationError, setVersionCustomFieldValues, validateVersionCustomFieldValues } from "./set-version-custom-field-values";

function field(overrides: Partial<CustomField>): CustomField {
  return {
    id: "field-1",
    name: "Build",
    customizedType: "Version",
    fieldFormat: "int",
    isRequired: false,
    defaultValue: null,
    visible: true,
    roleIds: [],
    multiple: false,
    possibleValues: [],
    position: 1,
    trackerIds: [],
    ...overrides,
  };
}

function repos(fields: CustomField[]) {
  const customFieldRepository = { listForCustomizedType: mock(async () => fields) } as unknown as CustomFieldRepository;
  const customValueRepository = { set: mock(async () => ({})) } as unknown as CustomValueRepository;
  return { customFieldRepository, customValueRepository };
}

describe("setVersionCustomFieldValues", () => {
  it("writes a value against the version", async () => {
    const r = repos([field({})]);
    await setVersionCustomFieldValues(r, "version-1", { "field-1": "42" }, { isAdmin: true, roleIds: [] });
    expect(r.customValueRepository.set).toHaveBeenCalledWith("field-1", "Version", "version-1", "42");
  });

  it("rejects an invalid value and writes nothing", async () => {
    const r = repos([field({})]);
    await expect(setVersionCustomFieldValues(r, "version-1", { "field-1": "forty-two" }, { isAdmin: true, roleIds: [] })).rejects.toBeInstanceOf(
      CustomFieldValidationError,
    );
    expect(r.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("skips a restricted field the editor can't see, even when it is named", async () => {
    const r = repos([field({ visible: false, roleIds: ["manager"] })]);
    await setVersionCustomFieldValues(r, "version-1", { "field-1": "42" }, { isAdmin: false, roleIds: ["developer"] });
    expect(r.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("validates before a version is created, so an invalid value doesn't leave a version behind", async () => {
    const r = repos([field({})]);
    await expect(validateVersionCustomFieldValues(r.customFieldRepository, { "field-1": "x" }, { isAdmin: true, roleIds: [] })).rejects.toBeInstanceOf(
      CustomFieldValidationError,
    );
  });
});
