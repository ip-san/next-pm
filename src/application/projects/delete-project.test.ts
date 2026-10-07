import { describe, expect, it, mock } from "bun:test";
import type { AttachmentStorage } from "@/domain/attachment/repository";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import { ProjectHasSubprojectsError, type ProjectRepository } from "@/domain/project/repository";
import type { Role } from "@/domain/role/entity";
import { deleteProject, DeleteProjectNotPermittedError, ProjectDeleteConfirmationMismatchError } from "./delete-project";

const leaf: Project = {
  id: "leaf",
  name: "Leaf",
  identifier: "leaf",
  description: "",
  isPublic: true,
  status: "active",
  parentId: null,
  lft: 1,
  rgt: 2,
  position: 0,
  enabledModules: [],
  trackerIds: [],
};

function makeRepositories(project: Project, deleteSubtreeImpl?: () => Promise<never>) {
  const projectRepository = {
    findById: mock(async () => project),
    deleteSubtree: mock(deleteSubtreeImpl ?? (async () => ({ removedProjectIds: [project.id], attachmentStorageKeys: ["key-1"] }))),
  } as unknown as ProjectRepository;
  const attachmentStorage = { delete: mock(async () => {}) } as unknown as AttachmentStorage;
  return { projectRepository, attachmentStorage };
}

const deleterRole: Pick<Role, "builtin" | "permissions" | "issuesVisibility"> = {
  builtin: 0,
  permissions: ["delete_project"],
  issuesVisibility: "all",
};
const deleter: AuthorizationActor = { kind: "member", roles: [deleterRole] };
const bystander: AuthorizationActor = { kind: "member", roles: [{ ...deleterRole, permissions: ["view_project"] }] };

describe("deleteProject", () => {
  it("lets an administrator take the whole subtree", async () => {
    const repositories = makeRepositories(leaf);
    await deleteProject(repositories, { projectId: "leaf", actor: { kind: "admin" }, isAdmin: true, confirmIdentifier: "leaf" });
    expect(repositories.projectRepository.deleteSubtree).toHaveBeenCalledWith("leaf", { allowNonLeaf: true });
  });

  it("lets a non-admin with delete_project remove a project, but only a leaf one", async () => {
    const repositories = makeRepositories(leaf);
    await deleteProject(repositories, { projectId: "leaf", actor: deleter, isAdmin: false, confirmIdentifier: "leaf" });
    expect(repositories.projectRepository.deleteSubtree).toHaveBeenCalledWith("leaf", { allowNonLeaf: false });
  });

  it("removes each attachment's file only after the rows are gone", async () => {
    const repositories = makeRepositories(leaf);
    const removed = await deleteProject(repositories, {
      projectId: "leaf",
      actor: { kind: "admin" },
      isAdmin: true,
      confirmIdentifier: "leaf",
    });

    expect(removed).toBe(1);
    expect(repositories.attachmentStorage.delete).toHaveBeenCalledWith("key-1");
  });

  it("refuses an actor without delete_project", async () => {
    const repositories = makeRepositories(leaf);
    await expect(
      deleteProject(repositories, { projectId: "leaf", actor: bystander, isAdmin: false, confirmIdentifier: "leaf" }),
    ).rejects.toBeInstanceOf(DeleteProjectNotPermittedError);
    expect(repositories.projectRepository.deleteSubtree).not.toHaveBeenCalled();
  });

  it("reports a subtree the transaction found as a permission failure, not a crash", async () => {
    const repositories = makeRepositories(leaf, async () => {
      throw new ProjectHasSubprojectsError();
    });
    await expect(
      deleteProject(repositories, { projectId: "leaf", actor: deleter, isAdmin: false, confirmIdentifier: "leaf" }),
    ).rejects.toBeInstanceOf(DeleteProjectNotPermittedError);
    expect(repositories.attachmentStorage.delete).not.toHaveBeenCalled();
  });

  it("refuses when the typed identifier does not match", async () => {
    const repositories = makeRepositories(leaf);
    await expect(
      deleteProject(repositories, { projectId: "leaf", actor: { kind: "admin" }, isAdmin: true, confirmIdentifier: "lea" }),
    ).rejects.toBeInstanceOf(ProjectDeleteConfirmationMismatchError);
    expect(repositories.projectRepository.deleteSubtree).not.toHaveBeenCalled();
  });
});
