import { describe, expect, it, mock } from "bun:test";
import { ArchiveBlockedError, archiveProject, unarchiveProject } from "./archive-project";
import { makeIssueRepositoryMock } from "@/domain/issue/test-support";
import { makeProject, makeProjectRepositoryMock } from "@/domain/project/test-support";
import type { Version } from "@/domain/version/entity";
import type { VersionRepository } from "@/domain/version/repository";

function makeVersionRepository(overrides: Partial<VersionRepository> = {}): VersionRepository {
  const notUsed = mock(async () => {
    throw new Error("not used");
  });
  return {
    listByProject: mock(async () => []),
    listSharedWith: mock(async () => []),
    findById: mock(async () => null),
    create: notUsed as unknown as VersionRepository["create"],
    update: notUsed as unknown as VersionRepository["update"],
    delete: mock(async () => {}),
    countFixedIssues: mock(async () => 0),
    ...overrides,
  };
}

describe("archiveProject", () => {
  it("archives the whole subtree regardless of status", async () => {
    const projectRepository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "root", status: "active" })),
      listDescendants: mock(async () => [makeProject({ id: "child", status: "closed" })]),
      updateStatusForIds: mock(async () => {}),
    });

    await archiveProject(projectRepository, makeVersionRepository(), makeIssueRepositoryMock(), "root");

    expect(projectRepository.updateStatusForIds).toHaveBeenCalledWith(["root", "child"], "archived");
  });

  it("refuses when an issue outside the subtree targets a subtree version", async () => {
    const projectRepository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "root" })),
      updateStatusForIds: mock(async () => {}),
    });
    const versionRepository = makeVersionRepository({
      listByProject: mock(async () => [{ id: "version-1" } as Version]),
    });
    const issueRepository = makeIssueRepositoryMock({
      existsOutsideProjectsWithFixedVersion: mock(async () => true),
    });

    await expect(archiveProject(projectRepository, versionRepository, issueRepository, "root")).rejects.toThrow(ArchiveBlockedError);
    expect(issueRepository.existsOutsideProjectsWithFixedVersion).toHaveBeenCalledWith(["version-1"], ["root"]);
    expect(projectRepository.updateStatusForIds).not.toHaveBeenCalled();
  });

  it("skips the version guard query entirely when the subtree has no versions", async () => {
    const issueRepository = makeIssueRepositoryMock();
    const projectRepository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "root" })),
      updateStatusForIds: mock(async () => {}),
    });

    await archiveProject(projectRepository, makeVersionRepository(), issueRepository, "root");

    expect(issueRepository.existsOutsideProjectsWithFixedVersion).not.toHaveBeenCalled();
    expect(projectRepository.updateStatusForIds).toHaveBeenCalledWith(["root"], "archived");
  });
});

describe("unarchiveProject", () => {
  it("restores the project and archived ancestors to active", async () => {
    const projectRepository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "self", status: "archived" })),
      listAncestors: mock(async () => [makeProject({ id: "parent", status: "archived" }), makeProject({ id: "root", status: "active" })]),
      updateStatusForIds: mock(async () => {}),
    });

    await unarchiveProject(projectRepository, "self");

    expect(projectRepository.updateStatusForIds).toHaveBeenCalledWith(["self", "parent"], "active");
  });

  it("restores to closed when an ancestor is closed", async () => {
    const projectRepository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "self", status: "archived" })),
      listAncestors: mock(async () => [makeProject({ id: "parent", status: "closed" })]),
      updateStatusForIds: mock(async () => {}),
    });

    await unarchiveProject(projectRepository, "self");

    expect(projectRepository.updateStatusForIds).toHaveBeenCalledWith(["self"], "closed");
  });

  it("does not touch the database when the project is not archived", async () => {
    const projectRepository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "self", status: "active" })),
      updateStatusForIds: mock(async () => {}),
    });

    await unarchiveProject(projectRepository, "self");

    expect(projectRepository.updateStatusForIds).not.toHaveBeenCalled();
  });
});
