import { describe, expect, it, mock } from "bun:test";
import { copyRoleWorkflow } from "./copy-role-workflow";
import type { WorkflowFieldPermissionRepository, WorkflowRepository } from "@/domain/workflow/repository";

function makeRepositories() {
  const workflowRepository: WorkflowRepository = {
    listForTracker: mock(async () => []),
    listForTrackerAndRole: mock(async (trackerId: string, roleId: string) =>
      roleId === "source"
        ? [
            {
              id: "t1",
              trackerId,
              roleId,
              oldStatusId: "new",
              newStatusId: "closed",
              author: true,
              assignee: false,
            },
          ]
        : [],
    ),
    create: mock(async () => {
      throw new Error("not used");
    }),
    replaceForTrackerAndRole: mock(async () => {}),
  };
  const workflowFieldPermissionRepository: WorkflowFieldPermissionRepository = {
    listForTracker: mock(async () => []),
    listForTrackerAndRole: mock(async () => []),
    replaceForTrackerAndRole: mock(async () => {}),
  };
  return { workflowRepository, workflowFieldPermissionRepository };
}

describe("copyRoleWorkflow", () => {
  it("replaces the target role's rules tracker by tracker", async () => {
    const repositories = makeRepositories();

    await copyRoleWorkflow(repositories, ["bug", "feature"], "source", "target");

    expect(repositories.workflowRepository.replaceForTrackerAndRole).toHaveBeenCalledWith("bug", "target", [
      { oldStatusId: "new", newStatusId: "closed", author: true, assignee: false },
    ]);
    expect(repositories.workflowRepository.replaceForTrackerAndRole).toHaveBeenCalledWith("feature", "target", [
      { oldStatusId: "new", newStatusId: "closed", author: true, assignee: false },
    ]);
  });

  it("does nothing when source and target are the same role", async () => {
    const repositories = makeRepositories();
    await copyRoleWorkflow(repositories, ["bug"], "source", "source");
    expect(repositories.workflowRepository.replaceForTrackerAndRole).not.toHaveBeenCalled();
  });
});
