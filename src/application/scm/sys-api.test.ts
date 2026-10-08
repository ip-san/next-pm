import { describe, expect, it, mock } from "bun:test";
import { createSysProjectRepository, listSysProjects, type SysApiRepositories } from "./sys-api";
import type { Project } from "@/domain/project/entity";
import type { ScmRepository } from "@/domain/scm/entity";

function project(overrides: Partial<Project>): Project {
  return {
    id: "proj-a",
    name: "A",
    identifier: "a",
    description: "",
    isPublic: true,
    status: "active",
    parentId: null,
    lft: 1,
    rgt: 2,
    position: 1,
    enabledModules: ["repository"],
    trackerIds: [],
    ...overrides,
  };
}

function repository(overrides: Partial<ScmRepository>): ScmRepository {
  return {
    id: "repo-1",
    projectId: "proj-a",
    identifier: "",
    isDefault: true,
    vendor: "git",
    rootPath: "/srv/a.git",
    ...overrides,
  } as ScmRepository;
}

function repositoriesFor(projects: Project[], byProject: Record<string, ScmRepository[]>): SysApiRepositories {
  return {
    projectRepository: {
      listAll: mock(async () => projects),
      findById: mock(async () => null),
      findByIdentifier: mock(async () => null),
    } as unknown as SysApiRepositories["projectRepository"],
    scmRepositoryRepository: {
      listByProject: mock(async (projectId: string) => byProject[projectId] ?? []),
      create: mock(async () => repository({})),
    } as unknown as SysApiRepositories["scmRepositoryRepository"],
  };
}

describe("listSysProjects", () => {
  it("lists only active projects with the repository module, each with its default repository", async () => {
    const repositories = repositoriesFor(
      [
        project({ id: "proj-a", identifier: "a" }),
        project({ id: "proj-archived", identifier: "b", status: "archived" }),
        project({ id: "proj-no-module", identifier: "c", enabledModules: ["issue_tracking"] }),
      ],
      { "proj-a": [repository({ id: "repo-default", isDefault: true, rootPath: "/srv/a.git" })] },
    );
    const result = await listSysProjects(repositories);
    expect(result).toEqual([
      { id: "proj-a", identifier: "a", name: "A", is_public: true, status: 1, repository: { id: "repo-default", url: "/srv/a.git" } },
    ]);
  });

  it("reports repository as null for a project without a default repository", async () => {
    const result = await listSysProjects(repositoriesFor([project({})], {}));
    expect(result[0].repository).toBeNull();
  });
});

describe("createSysProjectRepository", () => {
  it("answers conflict, and creates nothing, when the project already has a default repository", async () => {
    const repositories = repositoriesFor([project({})], { "proj-a": [repository({ isDefault: true })] });
    const result = await createSysProjectRepository(
      repositories as SysApiRepositories & { scmRepositoryRepository: SysApiRepositories["scmRepositoryRepository"] },
      { projectId: "proj-a", vendor: "git", identifier: "", url: "/srv/other.git" },
    );
    expect(result).toEqual({ status: "conflict" });
    expect(repositories.scmRepositoryRepository.create).not.toHaveBeenCalled();
  });
});
