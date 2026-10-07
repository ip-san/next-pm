import { describe, expect, it, mock } from "bun:test";
import { copyTrackerWorkflow } from "./copy-tracker-workflow";
import type { WorkflowFieldPermission, WorkflowTransition } from "@/domain/workflow/entity";
import type { WorkflowFieldPermissionRepository, WorkflowRepository } from "@/domain/workflow/repository";

function transition(overrides: Partial<WorkflowTransition>): WorkflowTransition {
  return {
    id: "t",
    trackerId: "source",
    roleId: "role-a",
    oldStatusId: "new",
    newStatusId: "closed",
    author: false,
    assignee: false,
    ...overrides,
  };
}

function permission(overrides: Partial<WorkflowFieldPermission>): WorkflowFieldPermission {
  return {
    id: "p",
    trackerId: "source",
    roleId: "role-a",
    statusId: "new",
    fieldName: "dueDate",
    rule: "required",
    ...overrides,
  };
}

function makeRepositories(options: {
  transitions: WorkflowTransition[];
  permissions: WorkflowFieldPermission[];
}) {
  const workflowRepository: WorkflowRepository = {
    listForTracker: mock(async (trackerId: string) => options.transitions.filter((t) => t.trackerId === trackerId)),
    listForTrackerAndRole: mock(async () => []),
    create: mock(async () => {
      throw new Error("not used");
    }),
    replaceForTrackerAndRole: mock(async () => {}),
  };
  const workflowFieldPermissionRepository: WorkflowFieldPermissionRepository = {
    listForTracker: mock(async (trackerId: string) => options.permissions.filter((p) => p.trackerId === trackerId)),
    listForTrackerAndRole: mock(async () => []),
    replaceForTrackerAndRole: mock(async () => {}),
  };
  return { workflowRepository, workflowFieldPermissionRepository };
}

describe("copyTrackerWorkflow", () => {
  it("replaces the target's rules per role with the source's", async () => {
    const repositories = makeRepositories({
      transitions: [transition({ roleId: "role-a" })],
      permissions: [permission({ roleId: "role-a" })],
    });

    await copyTrackerWorkflow(repositories, "source", "target");

    expect(repositories.workflowRepository.replaceForTrackerAndRole).toHaveBeenCalledWith("target", "role-a", [
      { oldStatusId: "new", newStatusId: "closed", author: false, assignee: false },
    ]);
    expect(repositories.workflowFieldPermissionRepository.replaceForTrackerAndRole).toHaveBeenCalledWith(
      "target",
      "role-a",
      [{ statusId: "new", fieldName: "dueDate", rule: "required" }],
    );
  });

  it("clears a role the target has rules for but the source does not", async () => {
    const repositories = makeRepositories({
      transitions: [transition({ id: "t2", trackerId: "target", roleId: "role-b" })],
      permissions: [],
    });

    await copyTrackerWorkflow(repositories, "source", "target");

    expect(repositories.workflowRepository.replaceForTrackerAndRole).toHaveBeenCalledWith("target", "role-b", []);
  });

  it("does nothing when source and target are the same tracker", async () => {
    const repositories = makeRepositories({ transitions: [transition({})], permissions: [] });

    await copyTrackerWorkflow(repositories, "source", "source");

    expect(repositories.workflowRepository.replaceForTrackerAndRole).not.toHaveBeenCalled();
  });
});
