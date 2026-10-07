import { describe, expect, it, mock } from "bun:test";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Enumeration } from "@/domain/enumeration/entity";
import type { ProjectActivityRepository } from "@/domain/enumeration/project-activity-repository";
import type { EnumerationRepository } from "@/domain/enumeration/repository";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import { updateProjectActivities, UpdateProjectActivitiesNotPermittedError } from "./update-project-activities";

const project: Project = {
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
  enabledModules: ["time_tracking"],
  trackerIds: [],
};

function activity(id: string, overrides: Partial<Enumeration> = {}): Enumeration {
  return {
    id,
    type: "TimeEntryActivity",
    name: id,
    position: 1,
    isDefault: false,
    active: true,
    projectId: null,
    parentId: null,
    ...overrides,
  };
}

const design = activity("design");
const development = activity("development", { position: 2 });

function makeRepositories(overrides: Enumeration[] = []) {
  const projectRepository = { findById: mock(async () => project) } as unknown as ProjectRepository;
  const enumerationRepository = { listByType: mock(async () => [design, development]) } as unknown as EnumerationRepository;
  const projectActivityRepository = {
    listOverridesForProject: mock(async () => overrides),
    createOverride: mock(async (input: { parent: Enumeration }) => activity(`override-${input.parent.id}`, { projectId: "proj-1", parentId: input.parent.id, active: false })),
    updateOverride: mock(async () => {}),
    deleteOverride: mock(async () => {}),
    reassignTimeEntries: mock(async () => {}),
  } as unknown as ProjectActivityRepository;
  return { projectRepository, enumerationRepository, projectActivityRepository };
}

const manager: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["manage_project_activities"], issuesVisibility: "all" }],
};
const bystander: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["view_time_entries"], issuesVisibility: "all" }],
};

describe("updateProjectActivities", () => {
  it("refuses an actor without manage_project_activities", async () => {
    const repositories = makeRepositories();
    await expect(
      updateProjectActivities(repositories, { projectId: "proj-1", activeByActivityId: { design: false }, actor: bystander }),
    ).rejects.toBeInstanceOf(UpdateProjectActivitiesNotPermittedError);
    expect(repositories.projectActivityRepository.createOverride).not.toHaveBeenCalled();
  });

  it("creates an override and moves the project's time entries onto it", async () => {
    const repositories = makeRepositories();
    await updateProjectActivities(repositories, {
      projectId: "proj-1",
      activeByActivityId: { design: false, development: true },
      actor: manager,
    });

    expect(repositories.projectActivityRepository.createOverride).toHaveBeenCalledWith({
      projectId: "proj-1",
      parent: design,
      active: false,
    });
    expect(repositories.projectActivityRepository.reassignTimeEntries).toHaveBeenCalledWith("proj-1", "design", "override-design");
  });

  it("creates nothing for an activity left as the system has it", async () => {
    const repositories = makeRepositories();
    await updateProjectActivities(repositories, {
      projectId: "proj-1",
      activeByActivityId: { design: true, development: true },
      actor: manager,
    });
    expect(repositories.projectActivityRepository.createOverride).not.toHaveBeenCalled();
    expect(repositories.projectActivityRepository.deleteOverride).not.toHaveBeenCalled();
  });

  it("moves the time entries back before deleting an override that no longer differs", async () => {
    const override = activity("override-design", { projectId: "proj-1", parentId: "design", active: false });
    const repositories = makeRepositories([override]);

    await updateProjectActivities(repositories, { projectId: "proj-1", activeByActivityId: { design: true }, actor: manager });

    expect(repositories.projectActivityRepository.reassignTimeEntries).toHaveBeenCalledWith("proj-1", "override-design", "design");
    expect(repositories.projectActivityRepository.deleteOverride).toHaveBeenCalledWith("override-design");
  });

  it("flips an existing override rather than creating a second one", async () => {
    // A system activity that is inactive everywhere, which this project re-enables.
    const inactiveSystem = activity("design", { active: false });
    const override = activity("override-design", { projectId: "proj-1", parentId: "design", active: false });
    const repositories = makeRepositories([override]);
    repositories.enumerationRepository.listByType = mock(async () => [inactiveSystem]);

    await updateProjectActivities(repositories, { projectId: "proj-1", activeByActivityId: { design: true }, actor: manager });

    expect(repositories.projectActivityRepository.updateOverride).toHaveBeenCalledWith("override-design", { active: true });
    expect(repositories.projectActivityRepository.createOverride).not.toHaveBeenCalled();
  });
});
