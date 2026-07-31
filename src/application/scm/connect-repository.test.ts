import { describe, expect, it, mock } from "bun:test";
import { connectRepository, InvalidRepositoryError } from "./connect-repository";
import type { ScmRepository } from "@/domain/scm/entity";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";

function makeRepo(existing: ScmRepository | null = null): ScmRepositoryRepository {
  return {
    findByProject: mock(async () => existing),
    create: mock(async (r) => ({ ...r, id: "repo-1" }) as ScmRepository),
  };
}

const baseInput = { projectId: "proj-1", rootPath: "/var/repos/example.git" };

describe("connectRepository", () => {
  it("connects a repository given a valid absolute path", async () => {
    const scmRepositoryRepository = makeRepo();
    const repo = await connectRepository({ scmRepositoryRepository }, baseInput);
    expect(repo.rootPath).toBe("/var/repos/example.git");
  });

  it("rejects an empty path", async () => {
    const scmRepositoryRepository = makeRepo();
    await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, rootPath: "" })).rejects.toThrow(InvalidRepositoryError);
  });

  it("rejects a relative path", async () => {
    const scmRepositoryRepository = makeRepo();
    await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, rootPath: "relative/path" })).rejects.toThrow(InvalidRepositoryError);
  });

  it("rejects connecting a second repository to the same project", async () => {
    const existing: ScmRepository = { id: "repo-0", projectId: "proj-1", rootPath: "/existing" };
    const scmRepositoryRepository = makeRepo(existing);
    await expect(connectRepository({ scmRepositoryRepository }, baseInput)).rejects.toThrow(InvalidRepositoryError);
    expect(scmRepositoryRepository.create).not.toHaveBeenCalled();
  });
});
