import { describe, expect, it, mock } from "bun:test";
import { createProject } from "./create-project";
import type { Project } from "@/domain/project/entity";
import { makeProjectRepositoryMock } from "@/domain/project/test-support";

function makeRepository(overrides: Parameters<typeof makeProjectRepositoryMock>[0] = {}) {
  return makeProjectRepositoryMock({
    findById: mock(async () => null),
    createUnderParent: mock(async (project) => ({ ...project, id: "new-id", lft: 1, rgt: 2 }) as Project),
    ...overrides,
  });
}

describe("createProject", () => {
  it("creates a project when the identifier is free", async () => {
    const repository = makeRepository();
    const project = await createProject(repository, {
      name: "Alpha",
      identifier: "alpha",
      description: "",
      isPublic: true,
      parentId: null,
      enabledModules: ["issue_tracking"],
      trackerIds: [],
    });
    expect(project.identifier).toBe("alpha");
    expect(repository.createUnderParent).toHaveBeenCalled();
  });

  it("rejects a duplicate identifier", async () => {
    const repository = makeRepository({
      findByIdentifier: mock(async () => ({ identifier: "alpha" }) as Project),
    });
    await expect(
      createProject(repository, {
        name: "Alpha 2",
        identifier: "alpha",
        description: "",
        isPublic: true,
        parentId: null,
        enabledModules: [],
        trackerIds: [],
      }),
    ).rejects.toThrow(/already taken/);
  });
});
