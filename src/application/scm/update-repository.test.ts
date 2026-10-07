import { describe, expect, it, mock } from "bun:test";
import { InvalidRepositoryError } from "./connect-repository";
import { updateRepository } from "./update-repository";
import type { ScmRepository } from "@/domain/scm/entity";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";

function makeRepository(overrides: Partial<ScmRepository> = {}): ScmRepository {
  return {
    id: "repo-1",
    projectId: "proj-1",
    identifier: "",
    isDefault: true,
    vendor: "git",
    rootPath: "/repos/example",
    createdAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeRepo(repositories: ScmRepository[]): ScmRepositoryRepository {
  return {
    findById: mock(async (id) => repositories.find((repository) => repository.id === id) ?? null),
    listByProject: mock(async () => repositories),
    findDefaultForProject: mock(async () => repositories.find((repository) => repository.isDefault) ?? null),
    create: mock(async () => {
      throw new Error("not used");
    }),
    update: mock(async () => undefined),
    clearDefaultForProject: mock(async () => undefined),
    delete: mock(async () => undefined),
  };
}

describe("updateRepository", () => {
  it("names a repository that was saved without an identifier", async () => {
    const scmRepositoryRepository = makeRepo([makeRepository()]);
    await updateRepository({ scmRepositoryRepository }, { scmRepositoryId: "repo-1", identifier: "docs", isDefault: true });
    expect(scmRepositoryRepository.update).toHaveBeenCalledWith("repo-1", { identifier: "docs", isDefault: true });
  });

  // Redmine's `identifier=` is a silent no-op once `identifier_frozen?`, and its form disables the field.
  it("silently keeps a non-blank identifier instead of rewriting it", async () => {
    const scmRepositoryRepository = makeRepo([makeRepository({ identifier: "docs" })]);
    await updateRepository({ scmRepositoryRepository }, { scmRepositoryId: "repo-1", identifier: "renamed", isDefault: true });
    expect(scmRepositoryRepository.update).toHaveBeenCalledWith("repo-1", { identifier: "docs", isDefault: true });
  });

  it("rejects a new identifier that collides with a sibling", async () => {
    const scmRepositoryRepository = makeRepo([makeRepository(), makeRepository({ id: "repo-2", identifier: "docs", isDefault: false })]);
    await expect(
      updateRepository({ scmRepositoryRepository }, { scmRepositoryId: "repo-1", identifier: "docs", isDefault: true }),
    ).rejects.toThrow(InvalidRepositoryError);
    expect(scmRepositoryRepository.update).not.toHaveBeenCalled();
  });

  it("demotes the previous default only when this save turns the flag on", async () => {
    const scmRepositoryRepository = makeRepo([makeRepository({ id: "repo-2", identifier: "docs", isDefault: false })]);
    await updateRepository({ scmRepositoryRepository }, { scmRepositoryId: "repo-2", identifier: "docs", isDefault: true });
    expect(scmRepositoryRepository.clearDefaultForProject).toHaveBeenCalledWith("proj-1");
  });

  it("does not touch the other repositories when the flag was already on", async () => {
    const scmRepositoryRepository = makeRepo([makeRepository({ identifier: "docs" })]);
    await updateRepository({ scmRepositoryRepository }, { scmRepositoryId: "repo-1", identifier: "docs", isDefault: true });
    expect(scmRepositoryRepository.clearDefaultForProject).not.toHaveBeenCalled();
  });

  it("rejects an unknown repository", async () => {
    const scmRepositoryRepository = makeRepo([]);
    await expect(
      updateRepository({ scmRepositoryRepository }, { scmRepositoryId: "nope", identifier: "", isDefault: false }),
    ).rejects.toThrow(InvalidRepositoryError);
  });
});
