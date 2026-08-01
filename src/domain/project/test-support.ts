import { mock } from "bun:test";
import type { Project } from "./entity";
import type { ProjectRepository } from "./repository";

export function makeProject(overrides: Partial<Project> = {}): Project {
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

/** Every method defaults to a not-used throw or empty result; pass overrides for what a test actually exercises. */
export function makeProjectRepositoryMock(overrides: Partial<ProjectRepository> = {}): ProjectRepository {
  return {
    findById: mock(async () => makeProject()),
    findByIdentifier: mock(async () => null),
    listAll: mock(async () => []),
    listNestedSetNodes: mock(async () => []),
    listDescendants: mock(async () => []),
    listAncestors: mock(async () => []),
    createUnderParent: mock(async () => {
      throw new Error("not used");
    }),
    updateSettings: mock(async () => {
      throw new Error("not used");
    }),
    updateStatusForIds: mock(async () => {
      throw new Error("not used");
    }),
    ...overrides,
  };
}
