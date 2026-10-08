import { describe, expect, it, mock } from "bun:test";
import { updateProject, UpdateProjectNotPermittedError } from "./update-project";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import type { Role } from "@/domain/role/entity";

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
    updateStatus: mock(async () => {}),
    deleteSubtree: mock(async () => ({ removedProjectIds: [], attachmentStorageKeys: [] })),
    createUnderParent: mock(async (project) => ({ ...project, id: "new-id", lft: 1, rgt: 2 }) as Project),
    copySkeletonFrom: mock(async (_sourceProjectId, project) => ({ ...project, id: "new-id", lft: 1, rgt: 2 }) as Project),
    updateSettings: mock(async (id, settings) => ({ ...makeProject(), id, ...settings })),
    ...overrides,
  };
}

function actorWith(permissions: Role["permissions"]): AuthorizationActor {
  return { kind: "member", roles: [{ builtin: 0, permissions, issuesVisibility: "all", timeEntriesVisibility: "all" }] };
}

const admin = { actor: { kind: "admin" } as AuthorizationActor };
const settings = {
  name: "Alpha 2",
  description: "updated",
  isPublic: false,
  enabledModules: ["issue_tracking"],
  trackerIds: ["tracker-1"],
};

describe("updateProject", () => {
  it("updates settings for an existing project", async () => {
    const repository = makeRepository();

    const result = await updateProject(repository, "proj-1", settings, admin);

    expect(repository.updateSettings).toHaveBeenCalledWith("proj-1", settings);
    expect(result.name).toBe("Alpha 2");
  });

  it("rejects a nonexistent project", async () => {
    const repository = makeRepository({ findById: mock(async () => null) });
    await expect(
      updateProject(repository, "missing", { name: "x", description: "", isPublic: true, enabledModules: [], trackerIds: [] }, admin),
    ).rejects.toThrow(/not found/);
  });

  it("refuses an actor without edit_project", async () => {
    const repository = makeRepository();
    await expect(updateProject(repository, "proj-1", settings, { actor: actorWith(["view_project"]) })).rejects.toBeInstanceOf(
      UpdateProjectNotPermittedError,
    );
  });

  it("keeps the stored publicity and modules when the actor may not change them", async () => {
    const repository = makeRepository();

    await updateProject(repository, "proj-1", settings, { actor: actorWith(["edit_project"]) });

    // makeProject() is public with no modules; the submitted private/issue_tracking is dropped.
    expect(repository.updateSettings).toHaveBeenCalledWith("proj-1", { ...settings, isPublic: true, enabledModules: [] });
  });

  it("applies them when the actor holds select_project_publicity and select_project_modules", async () => {
    const repository = makeRepository();

    await updateProject(repository, "proj-1", settings, {
      actor: actorWith(["edit_project", "select_project_publicity", "select_project_modules"]),
    });

    expect(repository.updateSettings).toHaveBeenCalledWith("proj-1", settings);
  });
});
