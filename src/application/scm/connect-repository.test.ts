import { describe, expect, it, mock } from "bun:test";
import { connectRepository, InvalidRepositoryError } from "./connect-repository";
import type { ScmRepository } from "@/domain/scm/entity";
import type { ScmRepositoryRepository } from "@/domain/scm/repository";

function makeExisting(overrides: Partial<ScmRepository> = {}): ScmRepository {
  return {
    id: "repo-0",
    projectId: "proj-1",
    identifier: "existing",
    isDefault: true,
    vendor: "git",
    rootPath: "/existing",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRepo(existing: ScmRepository[] = []): ScmRepositoryRepository {
  return {
    findById: mock(async (id) => existing.find((repository) => repository.id === id) ?? null),
    listByProject: mock(async () => existing),
    findDefaultForProject: mock(async () => existing.find((repository) => repository.isDefault) ?? null),
    create: mock(async (r) => ({ ...r, id: "repo-1", createdAt: new Date() }) as ScmRepository),
    update: mock(async () => undefined),
    clearDefaultForProject: mock(async () => undefined),
    delete: mock(async () => undefined),
  };
}

const baseInput = { projectId: "proj-1", identifier: "", vendor: "git" as const, rootPath: "/var/repos/example.git", isDefault: false };

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

  // Redmine's `set_as_default?`: a project's first repository is the default whatever the form said.
  it("forces the project's first repository to be the default", async () => {
    const scmRepositoryRepository = makeRepo();
    const repo = await connectRepository({ scmRepositoryRepository }, { ...baseInput, isDefault: false });
    expect(repo.isDefault).toBe(true);
  });

  it("connects a second repository to the same project under a different identifier", async () => {
    const scmRepositoryRepository = makeRepo([makeExisting()]);
    const repo = await connectRepository({ scmRepositoryRepository }, { ...baseInput, identifier: "docs" });
    expect(repo.identifier).toBe("docs");
    expect(repo.isDefault).toBe(false);
    expect(scmRepositoryRepository.clearDefaultForProject).not.toHaveBeenCalled();
  });

  it("demotes the previous default when the new repository claims the flag", async () => {
    const scmRepositoryRepository = makeRepo([makeExisting()]);
    await connectRepository({ scmRepositoryRepository }, { ...baseInput, identifier: "docs", isDefault: true });
    expect(scmRepositoryRepository.clearDefaultForProject).toHaveBeenCalledWith("proj-1");
  });

  it("rejects a duplicate identifier within the same project", async () => {
    const scmRepositoryRepository = makeRepo([makeExisting({ identifier: "docs" })]);
    await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, identifier: "docs" })).rejects.toThrow(InvalidRepositoryError);
    expect(scmRepositoryRepository.create).not.toHaveBeenCalled();
  });

  // Redmine's uniqueness validation carries no allow_blank, so the blank identifier is unique too.
  it("rejects a second repository without an identifier", async () => {
    const scmRepositoryRepository = makeRepo([makeExisting({ identifier: "" })]);
    await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, identifier: "" })).rejects.toThrow(InvalidRepositoryError);
  });

  it("trims the identifier before validating it", async () => {
    const scmRepositoryRepository = makeRepo();
    const repo = await connectRepository({ scmRepositoryRepository }, { ...baseInput, identifier: "  docs  " });
    expect(repo.identifier).toBe("docs");
  });

  it("rejects identifiers Redmine's format validation rejects", async () => {
    for (const identifier of ["Docs", "with space", "dots.here", "123", "slash/es"]) {
      const scmRepositoryRepository = makeRepo();
      await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, identifier })).rejects.toThrow(InvalidRepositoryError);
    }
  });

  it("rejects an identifier that would shadow a repository sub-route", async () => {
    for (const identifier of ["revisions", "blame", "browse", "diff"]) {
      const scmRepositoryRepository = makeRepo();
      await expect(connectRepository({ scmRepositoryRepository }, { ...baseInput, identifier })).rejects.toThrow(InvalidRepositoryError);
    }
  });
});
