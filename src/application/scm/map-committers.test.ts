import { describe, expect, it, mock } from "bun:test";
import { mapCommitters } from "./map-committers";
import type { ChangesetRepository } from "@/domain/scm/changeset-repository";
import type { CommitterMapping } from "@/domain/scm/committer";

function makeRepositories(current: CommitterMapping[]) {
  const changesetRepository = {
    listCommitters: mock(async () => current),
    remapCommitter: mock(async () => undefined),
  } as unknown as ChangesetRepository;
  return { changesetRepository };
}

describe("mapCommitters", () => {
  it("re-points a committer at the chosen user", async () => {
    const repositories = makeRepositories([{ committerIdentity: "alice", userId: null }]);
    const remapped = await mapCommitters(repositories, {
      scmRepositoryId: "repo-1",
      assignments: [{ committerIdentity: "alice", userId: "user-1" }],
    });
    expect(remapped).toEqual(["alice"]);
    expect(repositories.changesetRepository.remapCommitter).toHaveBeenCalledWith("repo-1", "alice", "user-1");
  });

  it("unmaps a committer when no user is chosen", async () => {
    const repositories = makeRepositories([{ committerIdentity: "alice", userId: "user-1" }]);
    await mapCommitters(repositories, { scmRepositoryId: "repo-1", assignments: [{ committerIdentity: "alice", userId: null }] });
    expect(repositories.changesetRepository.remapCommitter).toHaveBeenCalledWith("repo-1", "alice", null);
  });

  it("writes nothing when the submitted user is already the stored one", async () => {
    const repositories = makeRepositories([{ committerIdentity: "alice", userId: "user-1" }]);
    const remapped = await mapCommitters(repositories, {
      scmRepositoryId: "repo-1",
      assignments: [{ committerIdentity: "alice", userId: "user-1" }],
    });
    expect(remapped).toEqual([]);
    expect(repositories.changesetRepository.remapCommitter).not.toHaveBeenCalled();
  });

  // Redmine iterates its own committer list, so a submitted string it doesn't know is ignored.
  it("ignores a committer that has no changesets in this repository", async () => {
    const repositories = makeRepositories([{ committerIdentity: "alice", userId: null }]);
    const remapped = await mapCommitters(repositories, {
      scmRepositoryId: "repo-1",
      assignments: [{ committerIdentity: "mallory", userId: "user-1" }],
    });
    expect(remapped).toEqual([]);
    expect(repositories.changesetRepository.remapCommitter).not.toHaveBeenCalled();
  });

  it("leaves a committer the form didn't submit untouched", async () => {
    const repositories = makeRepositories([
      { committerIdentity: "alice", userId: null },
      { committerIdentity: "bob", userId: "user-2" },
    ]);
    await mapCommitters(repositories, { scmRepositoryId: "repo-1", assignments: [{ committerIdentity: "alice", userId: "user-1" }] });
    expect(repositories.changesetRepository.remapCommitter).toHaveBeenCalledTimes(1);
    expect(repositories.changesetRepository.remapCommitter).toHaveBeenCalledWith("repo-1", "alice", "user-1");
  });
});
