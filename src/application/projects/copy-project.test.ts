import { describe, expect, it, mock } from "bun:test";
import { copyProject } from "./copy-project";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";

const sourceProject: Project = {
  id: "source-id",
  name: "Source",
  identifier: "source",
  description: "",
  isPublic: true,
  status: "active",
  parentId: null,
  lft: 1,
  rgt: 2,
  position: 0,
  enabledModules: ["issue_tracking"],
  trackerIds: [],
};

function makeRepository(overrides: Partial<ProjectRepository> = {}): ProjectRepository {
  return {
    findById: mock(async () => sourceProject),
    findByIdentifier: mock(async () => null),
    listAll: mock(async () => []),
    listNestedSetNodes: mock(async () => []),
    listDescendants: mock(async () => []),
    createUnderParent: mock(async (project) => ({ ...project, id: "new-id", lft: 1, rgt: 2 }) as Project),
    copySkeletonFrom: mock(
      async (_sourceProjectId, project) => ({ ...project, id: "new-id", lft: 3, rgt: 4 }) as Project,
    ),
    updateSettings: mock(async (id, settings) => ({ id, lft: 1, rgt: 2, status: "active", parentId: null, position: 0, identifier: "", ...settings }) as Project),
    ...overrides,
  };
}

describe("copyProject", () => {
  it("copies a project when the source exists and the new identifier is free", async () => {
    const repository = makeRepository();
    const project = await copyProject(repository, {
      sourceProjectId: "source-id",
      name: "Copy",
      identifier: "copy",
      description: "",
      isPublic: true,
      parentId: null,
      enabledModules: ["issue_tracking"],
      trackerIds: [],
    });
    expect(project.identifier).toBe("copy");
    expect(repository.copySkeletonFrom).toHaveBeenCalled();
  });

  it("rejects a missing source project", async () => {
    const repository = makeRepository({ findById: mock(async () => null) });
    await expect(
      copyProject(repository, {
        sourceProjectId: "missing",
        name: "Copy",
        identifier: "copy",
        description: "",
        isPublic: true,
        parentId: null,
        enabledModules: [],
        trackerIds: [],
      }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects a duplicate identifier", async () => {
    const repository = makeRepository({
      findByIdentifier: mock(async () => ({ ...sourceProject, identifier: "copy" }) as Project),
    });
    await expect(
      copyProject(repository, {
        sourceProjectId: "source-id",
        name: "Copy",
        identifier: "copy",
        description: "",
        isPublic: true,
        parentId: null,
        enabledModules: [],
        trackerIds: [],
      }),
    ).rejects.toThrow(/already taken/);
  });
});
