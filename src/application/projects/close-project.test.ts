import { describe, expect, it, mock } from "bun:test";
import { closeProject, reopenProject } from "./close-project";
import { makeProject, makeProjectRepositoryMock } from "@/domain/project/test-support";

describe("closeProject", () => {
  it("closes the project and its active descendants in one bulk update", async () => {
    const repository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "root", status: "active" })),
      listDescendants: mock(async () => [
        makeProject({ id: "child-active", status: "active" }),
        makeProject({ id: "child-closed", status: "closed" }),
      ]),
      updateStatusForIds: mock(async () => {}),
    });

    await closeProject(repository, "root");

    expect(repository.updateStatusForIds).toHaveBeenCalledWith(["root", "child-active"], "closed");
  });

  it("does not touch the database when nothing is active", async () => {
    const repository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "root", status: "closed" })),
      updateStatusForIds: mock(async () => {}),
    });

    await closeProject(repository, "root");

    expect(repository.updateStatusForIds).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent project", async () => {
    const repository = makeProjectRepositoryMock({ findById: mock(async () => null) });
    await expect(closeProject(repository, "missing")).rejects.toThrow(/not found/);
  });
});

describe("reopenProject", () => {
  it("reopens the project and its closed descendants, leaving archived descendants archived", async () => {
    const repository = makeProjectRepositoryMock({
      findById: mock(async () => makeProject({ id: "root", status: "closed" })),
      listDescendants: mock(async () => [
        makeProject({ id: "child-closed", status: "closed" }),
        makeProject({ id: "child-archived", status: "archived" }),
      ]),
      updateStatusForIds: mock(async () => {}),
    });

    await reopenProject(repository, "root");

    expect(repository.updateStatusForIds).toHaveBeenCalledWith(["root", "child-closed"], "active");
  });
});
