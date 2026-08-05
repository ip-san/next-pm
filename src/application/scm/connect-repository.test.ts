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

const baseInput = { projectId: "proj-1", vendor: "git" as const, rootPath: "/var/repos/example.git" };

describe("connectRepository", () => {
  it("connects a git repository given a valid absolute path", async () => {
    const scmRepositoryRepository = makeRepo();
    const repo = await connectRepository({ scmRepositoryRepository }, baseInput);
    expect(repo.rootPath).toBe("/var/repos/example.git");
  });

  it("connects a mercurial repository given a valid absolute path", async () => {
    const scmRepositoryRepository = makeRepo();
    const repo = await connectRepository({ scmRepositoryRepository }, { ...baseInput, vendor: "mercurial", rootPath: "/var/repos/example-hg" });
    expect(repo.vendor).toBe("mercurial");
  });

  it("rejects an empty path", async () => {
    const scmRepositoryRepository = makeRepo();
    await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, rootPath: "" })).rejects.toThrow(InvalidRepositoryError);
  });

  it("rejects a relative path for git", async () => {
    const scmRepositoryRepository = makeRepo();
    await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, rootPath: "relative/path" })).rejects.toThrow(InvalidRepositoryError);
  });

  it("rejects a relative path for mercurial", async () => {
    const scmRepositoryRepository = makeRepo();
    await expect(
      connectRepository({ scmRepositoryRepository }, { ...baseInput, vendor: "mercurial", rootPath: "relative/path" }),
    ).rejects.toThrow(InvalidRepositoryError);
  });

  it("connects a subversion repository given a file:// URL", async () => {
    const scmRepositoryRepository = makeRepo();
    const repo = await connectRepository(
      { scmRepositoryRepository },
      { ...baseInput, vendor: "subversion", rootPath: "file:///var/svn/example" },
    );
    expect(repo.vendor).toBe("subversion");
  });

  it("connects a subversion repository given an http(s):// or svn(+ssh):// URL", async () => {
    const scmRepositoryRepository = makeRepo();
    for (const rootPath of ["http://svn.example.com/repo", "https://svn.example.com/repo", "svn://svn.example.com/repo", "svn+ssh://svn.example.com/repo"]) {
      await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, vendor: "subversion", rootPath })).resolves.toBeTruthy();
    }
  });

  it("rejects a subversion path that isn't a URL", async () => {
    const scmRepositoryRepository = makeRepo();
    await expect(
      connectRepository({ scmRepositoryRepository }, { ...baseInput, vendor: "subversion", rootPath: "/var/svn/example" }),
    ).rejects.toThrow(InvalidRepositoryError);
  });

  it("rejects connecting a second repository to the same project", async () => {
    const existing: ScmRepository = { id: "repo-0", projectId: "proj-1", vendor: "git", rootPath: "/existing", createdAt: new Date() };
    const scmRepositoryRepository = makeRepo(existing);
    await expect(connectRepository({ scmRepositoryRepository }, baseInput)).rejects.toThrow(InvalidRepositoryError);
    expect(scmRepositoryRepository.create).not.toHaveBeenCalled();
  });
});
