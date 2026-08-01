import { describe, expect, it, mock } from "bun:test";
import { updateProject } from "./update-project";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    name: "Alpha",
    identifier: "alpha",
    description: "",
    isPublic: true,
    status: "active",
    parentId: null,
    lft: 1,
    rgt: 2,
    position: 0,
    enabledModules: [],
    trackerIds: [],
    ...overrides,
  };
}

function makeRepository(overrides: Partial<ProjectRepository> = {}): ProjectRepository {
  return {
    findById: mock(async () => makeProject()),
    findByIdentifier: mock(async () => null),
    listAll: mock(async () => []),
    listNestedSetNodes: mock(async () => []),
    listDescendants: mock(async () => []),
    createUnderParent: mock(async (project) => ({ ...project, id: "new-id", lft: 1, rgt: 2 }) as Project),
    updateSettings: mock(async (id, settings) => ({ ...makeProject(), id, ...settings })),
    ...overrides,
  };
}

describe("updateProject", () => {
  it("updates settings for an existing project", async () => {
    const repository = makeRepository();
    const settings = { name: "Alpha 2", description: "updated", isPublic: false, enabledModules: ["issue_tracking"], trackerIds: ["tracker-1"] };

    const result = await updateProject(repository, "proj-1", settings);

    expect(repository.updateSettings).toHaveBeenCalledWith("proj-1", settings);
    expect(result.name).toBe("Alpha 2");
  });

  it("rejects a nonexistent project", async () => {
    const repository = makeRepository({ findById: mock(async () => null) });
    await expect(
      updateProject(repository, "missing", { name: "x", description: "", isPublic: true, enabledModules: [], trackerIds: [] }),
    ).rejects.toThrow(/not found/);
  });
});
