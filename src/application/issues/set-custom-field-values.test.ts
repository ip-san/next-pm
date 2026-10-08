import { describe, expect, it, mock } from "bun:test";
import { setIssueCustomFieldValues, CustomFieldValidationError } from "./set-custom-field-values";
import type { CustomField } from "@/domain/custom-field/entity";
import type { CustomFieldRepository } from "@/domain/custom-field/repository";
import type { CustomValueRepository } from "@/domain/custom-value/repository";
import type { MemberRepository } from "@/domain/member/repository";
import type { UserRepository } from "@/domain/user/repository";
import type { VersionRepository } from "@/domain/version/repository";

function makeField(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "field-1",
    name: "Severity",
    customizedType: "Issue",
    fieldFormat: "list",
    isRequired: false,
    defaultValue: null,
    visible: true,
    roleIds: [],
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
    listForCustomizedType: mock(async () => fields),
    findById: mock(async () => fields[0] ?? null),
    create: mock(async (f) => ({ ...f, id: "new-field" })),
  };
  const customValueRepository: CustomValueRepository = {
    listForCustomized: mock(async () => []),
    deleteForCustomized: mock(async () => {}),
    set: mock(async (customFieldId, customizedType, customizedId, value) => ({
      id: "cv-1",
      customFieldId,
      customizedType,
      customizedId,
      value,
    })),
  };
  // Only user and version fields reach these; the other formats never call them.
  const memberRepository = { listByProject: mock(async () => []) } as unknown as MemberRepository;
  const userRepository = { findByIds: mock(async () => []) } as unknown as UserRepository;
  const versionRepository = { listSharedWith: mock(async () => []) } as unknown as VersionRepository;
  return { customFieldRepository, customValueRepository, memberRepository, userRepository, versionRepository };
}

describe("setIssueCustomFieldValues visibility", () => {
  const restricted = makeField({ id: "field-secret", name: "Secret", visible: false, roleIds: ["manager"] });

  it("writes a restricted field for a viewer holding one of its roles", async () => {
    const repos = makeRepos([restricted]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "field-secret": "High" }, { isAdmin: false, roleIds: ["manager"] });
    expect(repos.customValueRepository.set).toHaveBeenCalledWith("field-secret", "Issue", "issue-1", "High");
  });

  it("ignores a restricted field the viewer can't see, even when the request names it", async () => {
    const repos = makeRepos([restricted]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "field-secret": "High" }, { isAdmin: false, roleIds: ["reporter"] });
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("doesn't validate a hidden field, so its invalid submitted value can't block the edit", async () => {
    const repos = makeRepos([restricted]);
    await expect(
      setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "field-secret": "Nope" }, { isAdmin: false, roleIds: [] }),
    ).resolves.toEqual([]);
  });
});

describe("setIssueCustomFieldValues", () => {
  it("persists a valid value for a field present in rawValues", async () => {
    const repos = makeRepos([makeField()]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "field-1": "High" }, { isAdmin: true, roleIds: [] });
    expect(repos.customValueRepository.set).toHaveBeenCalledWith("field-1", "Issue", "issue-1", "High");
  });

  it("throws with a field-level error and writes nothing when a value is invalid", async () => {
    const repos = makeRepos([makeField()]);
    await expect(
      setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "field-1": "Unknown" }, { isAdmin: true, roleIds: [] }),
    ).rejects.toThrow(CustomFieldValidationError);
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("does not touch a required field that isn't present in rawValues (partial-update semantics)", async () => {
    // Regression: a PATCH updating one field must not be rejected because some other
    // already-set required custom field wasn't resent in this call.
    const repos = makeRepos([makeField({ id: "field-1", isRequired: true }), makeField({ id: "field-2", name: "Other" })]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "field-2": "High" }, { isAdmin: true, roleIds: [] });
    expect(repos.customValueRepository.set).toHaveBeenCalledTimes(1);
    expect(repos.customValueRepository.set).toHaveBeenCalledWith("field-2", "Issue", "issue-1", "High");
  });

  it("treats a required field as invalid when explicitly present but blank", async () => {
    const repos = makeRepos([makeField({ isRequired: true })]);
    await expect(setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "field-1": "" }, { isAdmin: true, roleIds: [] })).rejects.toThrow(
      CustomFieldValidationError,
    );
  });

  it("silently ignores a field id not applicable to this tracker", async () => {
    const repos = makeRepos([]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "not-applicable": "value" }, { isAdmin: true, roleIds: [] });
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("writes nothing when rawValues is empty", async () => {
    const repos = makeRepos([makeField()]);
    await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", {}, { isAdmin: true, roleIds: [] });
    expect(repos.customValueRepository.set).not.toHaveBeenCalled();
  });

  it("reports all field errors together, not just the first", async () => {
    const repos = makeRepos([
      makeField({ id: "field-1", isRequired: true }),
      makeField({ id: "field-2", isRequired: true, name: "Other" }),
    ]);
    try {
      await setIssueCustomFieldValues(repos, "tracker-1", "issue-1", "project-1", { "field-1": "", "field-2": "" }, { isAdmin: true, roleIds: [] });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomFieldValidationError);
      expect(Object.keys((error as CustomFieldValidationError).fieldErrors)).toEqual(["field-1", "field-2"]);
    }
  });
});
