import { describe, expect, it, mock } from "bun:test";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import type { Role } from "@/domain/role/entity";
import type { Version } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";
import {
  archiveProject,
  closeProject,
  ProjectArchiveBlockedError,
  ProjectStatusChangeNotPermittedError,
  reopenProject,
  unarchiveProject,
} from "./project-status";

function project(overrides: Partial<Project> & Pick<Project, "id" | "lft" | "rgt">): Project {
  return {
    name: overrides.id,
    identifier: overrides.id,
    description: "",
    isPublic: true,
    status: "active",
    parentId: null,
    position: 0,
    enabledModules: [],
    trackerIds: [],
    ...overrides,
  };
}

const parent = project({ id: "parent", lft: 1, rgt: 4 });
const child = project({ id: "child", lft: 2, rgt: 3, parentId: "parent" });

function makeRepositories(projects: Project[], versions: Version[] = [], issues: Issue[] = []) {
  const projectRepository = {
    findById: mock(async (id: string) => projects.find((p) => p.id === id) ?? null),
    listAll: mock(async () => projects),
    updateStatus: mock(async () => {}),
  } as unknown as ProjectRepository;
  const versionRepository = {
    listByProjects: mock(async () => versions),
  } as unknown as VersionRepository;
  const issueRepository = {
    listByFixedVersionIds: mock(async () => issues),
  } as unknown as IssueRepository;
  return { projectRepository, versionRepository, issueRepository };
}

const closerRole: Pick<Role, "builtin" | "permissions" | "issuesVisibility"> = {
  builtin: 0,
  permissions: ["close_project"],
  issuesVisibility: "all",
};
const closer: AuthorizationActor = { kind: "member", roles: [closerRole] };
const bystander: AuthorizationActor = { kind: "member", roles: [{ ...closerRole, permissions: ["view_project"] }] };

describe("archiveProject", () => {
  it("refuses a non-admin, matching ProjectsController's require_admin", async () => {
    const repositories = makeRepositories([parent, child]);
    await expect(archiveProject(repositories, { projectId: "parent", isAdmin: false })).rejects.toBeInstanceOf(
      ProjectStatusChangeNotPermittedError,
    );
    expect(repositories.projectRepository.updateStatus).not.toHaveBeenCalled();
  });

  it("archives the project together with its subtree", async () => {
    const repositories = makeRepositories([parent, child]);
    await archiveProject(repositories, { projectId: "parent", isAdmin: true });
    expect(repositories.projectRepository.updateStatus).toHaveBeenCalledWith(["parent", "child"], "archived");
  });

  it("refuses when an issue outside the subtree is assigned to one of its versions", async () => {
    const outsider = project({ id: "outsider", lft: 5, rgt: 6 });
    const version = { id: "v-1", projectId: "child" } as Version;
    const issue = { id: "i-1", projectId: "outsider", fixedVersionId: "v-1" } as Issue;
    const repositories = makeRepositories([parent, child, outsider], [version], [issue]);

    await expect(archiveProject(repositories, { projectId: "parent", isAdmin: true })).rejects.toBeInstanceOf(ProjectArchiveBlockedError);
    expect(repositories.projectRepository.updateStatus).not.toHaveBeenCalled();
  });
});

describe("unarchiveProject", () => {
  it("restores the project without touching its still-archived children", async () => {
    const archivedParent = { ...parent, status: "archived" as const };
    const archivedChild = { ...child, status: "archived" as const };
    const repositories = makeRepositories([archivedParent, archivedChild]);

    await unarchiveProject(repositories, { projectId: "parent", isAdmin: true });
    expect(repositories.projectRepository.updateStatus).toHaveBeenCalledWith(["parent"], "active");
  });
});

describe("closeProject / reopenProject", () => {
  it("closes the subtree for an actor holding close_project", async () => {
    const repositories = makeRepositories([parent, child]);
    await closeProject(repositories, { projectId: "parent", actor: closer });
    expect(repositories.projectRepository.updateStatus).toHaveBeenCalledWith(["parent", "child"], "closed");
  });

  it("refuses an actor without close_project", async () => {
    const repositories = makeRepositories([parent, child]);
    await expect(closeProject(repositories, { projectId: "parent", actor: bystander })).rejects.toBeInstanceOf(
      ProjectStatusChangeNotPermittedError,
    );
  });

  it("reopens a closed project — close_project is a read permission, so the closed state does not block it", async () => {
    const closedParent = { ...parent, status: "closed" as const };
    const closedChild = { ...child, status: "closed" as const };
    const repositories = makeRepositories([closedParent, closedChild]);

    await reopenProject(repositories, { projectId: "parent", actor: closer });
    expect(repositories.projectRepository.updateStatus).toHaveBeenCalledWith(["parent", "child"], "active");
  });
});
