import { describe, expect, it, mock } from "bun:test";
import {
  deleteEnumeration,
  EnumerationNotDeletableError,
  EnumerationReassignmentRequiredError,
} from "./delete-enumeration";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { EnumerationAdminRepository } from "@/domain/enumeration/repository";

function enumeration(overrides: Partial<Enumeration> = {}): Enumeration {
  return {
    id: "high",
    type: "IssuePriority",
    name: "高め",
    position: 1,
    isDefault: false,
    projectId: null,
    parentId: null,
    ...overrides,
  };
}

function makeRepo(rows: Enumeration[], objectsCount: number): EnumerationAdminRepository {
  return {
    findById: mock(async (id: string) => rows.find((row) => row.id === id) ?? null),
    update: mock(async () => {
      throw new Error("not used");
    }),
    delete: mock(async () => {}),
    countObjectsUsing: mock(async () => objectsCount),
    transferRelations: mock(async () => {}),
    updatePositions: mock(async () => {}),
  };
}

describe("deleteEnumeration", () => {
  it("deletes an unused enumeration without reassignment", async () => {
    const enumerationAdminRepository = makeRepo([enumeration()], 0);
    await deleteEnumeration({ enumerationAdminRepository }, "high", null);
    expect(enumerationAdminRepository.transferRelations).not.toHaveBeenCalled();
    expect(enumerationAdminRepository.delete).toHaveBeenCalledWith("high");
  });

  it("asks for a reassignment target when the enumeration is in use", async () => {
    const enumerationAdminRepository = makeRepo([enumeration()], 4);
    await expect(deleteEnumeration({ enumerationAdminRepository }, "high", null)).rejects.toThrow(
      EnumerationReassignmentRequiredError,
    );
    expect(enumerationAdminRepository.delete).not.toHaveBeenCalled();
  });

  it("transfers the objects before deleting when a target is given", async () => {
    const target = enumeration({ id: "normal", name: "通常" });
    const enumerationAdminRepository = makeRepo([enumeration(), target], 4);

    await deleteEnumeration({ enumerationAdminRepository }, "high", "normal");

    expect(enumerationAdminRepository.transferRelations).toHaveBeenCalledWith(
      expect.objectContaining({ id: "high" }),
      "normal",
    );
    expect(enumerationAdminRepository.delete).toHaveBeenCalledWith("high");
  });

  it("refuses a target of a different type", async () => {
    const target = enumeration({ id: "design", type: "TimeEntryActivity" });
    const enumerationAdminRepository = makeRepo([enumeration(), target], 4);
    await expect(deleteEnumeration({ enumerationAdminRepository }, "high", "design")).rejects.toThrow(
      EnumerationNotDeletableError,
    );
  });

  it("refuses a project override as a target (Redmine only offers system rows)", async () => {
    const target = enumeration({ id: "override", projectId: "project-1", parentId: "high" });
    const enumerationAdminRepository = makeRepo([enumeration(), target], 4);
    await expect(deleteEnumeration({ enumerationAdminRepository }, "high", "override")).rejects.toThrow(
      EnumerationNotDeletableError,
    );
  });

  it("refuses reassigning to itself", async () => {
    const enumerationAdminRepository = makeRepo([enumeration()], 4);
    await expect(deleteEnumeration({ enumerationAdminRepository }, "high", "high")).rejects.toThrow(
      EnumerationNotDeletableError,
    );
  });
});
