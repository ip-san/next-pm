import { describe, expect, it, mock } from "bun:test";
import { updateProject } from "./update-project";
import { makeProject, makeProjectRepositoryMock } from "@/domain/project/test-support";

describe("updateProject", () => {
  it("updates settings for an existing project", async () => {
    const repository = makeProjectRepositoryMock({
      updateSettings: mock(async (id, settings) => ({ ...makeProject(), id, ...settings })),
    });
    const settings = { name: "Alpha 2", description: "updated", isPublic: false, enabledModules: ["issue_tracking"], trackerIds: ["tracker-1"] };

    const result = await updateProject(repository, "proj-1", settings);

    expect(repository.updateSettings).toHaveBeenCalledWith("proj-1", settings);
    expect(result.name).toBe("Alpha 2");
  });

  it("rejects a nonexistent project", async () => {
    const repository = makeProjectRepositoryMock({ findById: mock(async () => null) });
    await expect(
      updateProject(repository, "missing", { name: "x", description: "", isPublic: true, enabledModules: [], trackerIds: [] }),
    ).rejects.toThrow(/not found/);
  });
});
