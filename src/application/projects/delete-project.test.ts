import { describe, expect, it, mock } from "bun:test";
import type { AttachmentStorage } from "@/domain/attachment/repository";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { Project } from "@/domain/project/entity";
import type { NestedSetNode } from "@/domain/project/nested-set";
import type { ProjectRepository } from "@/domain/project/repository";
import type { Role } from "@/domain/role/entity";
import { deleteProject, DeleteProjectNotPermittedError, ProjectDeleteConfirmationMismatchError } from "./delete-project";

const parent: Project = {
  id: "parent",
  name: "Parent",
  identifier: "parent",
  description: "",
  isPublic: true,
  status: "active",
  parentId: null,
  lft: 1,
  rgt: 4,
  position: 0,
  enabledModules: [],
  trackerIds: [],
};
const child: Project = { ...parent, id: "child", name: "Child", identifier: "child", parentId: "parent", lft: 2, rgt: 3 };
const leaf: Project = { ...parent, id: "leaf", name: "Leaf", identifier: "leaf", parentId: null, lft: 5, rgt: 6 };

function makeRepositories(project: Project, nodes: NestedSetNode[], attachments: { id: string; storageKey: string }[] = []) {
  const projectRepository = {
    findById: mock(async () => project),
    listNestedSetNodes: mock(async () => nodes),
    listAttachmentsInSubtree: mock(async () => attachments),
    deleteSubtree: mock(async () => {}),
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

const nodes: NestedSetNode[] = [parent, child, leaf].map(({ id, lft, rgt }) => ({ id, lft, rgt }));

describe("deleteProject", () => {
  it("deletes the subtree deepest first and closes the nested-set gap", async () => {
    const repositories = makeRepositories(parent, nodes);
    await deleteProject(repositories, { projectId: "parent", actor: { kind: "admin" }, isAdmin: true, confirmIdentifier: "parent" });

    expect(repositories.projectRepository.deleteSubtree).toHaveBeenCalledWith(["child", "parent"], [{ id: "leaf", lft: 1, rgt: 2 }]);
  });

  it("removes each attachment's file only after the rows are gone", async () => {
    const repositories = makeRepositories(leaf, nodes, [{ id: "a-1", storageKey: "key-1" }]);
    const removed = await deleteProject(repositories, {
      projectId: "leaf",
      actor: { kind: "admin" },
      isAdmin: true,
      confirmIdentifier: "leaf",
    });

    expect(removed).toBe(1);
    expect(repositories.attachmentStorage.delete).toHaveBeenCalledWith("key-1");
    expect(repositories.projectRepository.deleteSubtree).toHaveBeenCalled();
  });

  it("refuses an actor without delete_project", async () => {
    const repositories = makeRepositories(leaf, nodes);
    await expect(
      deleteProject(repositories, { projectId: "leaf", actor: bystander, isAdmin: false, confirmIdentifier: "leaf" }),
    ).rejects.toBeInstanceOf(DeleteProjectNotPermittedError);
    expect(repositories.projectRepository.deleteSubtree).not.toHaveBeenCalled();
  });

  it("lets a non-admin with delete_project remove a leaf project", async () => {
    const repositories = makeRepositories(leaf, nodes);
    await deleteProject(repositories, { projectId: "leaf", actor: deleter, isAdmin: false, confirmIdentifier: "leaf" });
    expect(repositories.projectRepository.deleteSubtree).toHaveBeenCalledWith(["leaf"], expect.anything());
  });

  it("refuses a non-admin on a project that still has subprojects, mirroring Project#deletable?'s leaf? check", async () => {
    const repositories = makeRepositories(parent, nodes);
    await expect(
      deleteProject(repositories, { projectId: "parent", actor: deleter, isAdmin: false, confirmIdentifier: "parent" }),
    ).rejects.toBeInstanceOf(DeleteProjectNotPermittedError);
  });

  it("refuses when the typed identifier does not match", async () => {
    const repositories = makeRepositories(leaf, nodes);
    await expect(
      deleteProject(repositories, { projectId: "leaf", actor: { kind: "admin" }, isAdmin: true, confirmIdentifier: "lea" }),
    ).rejects.toBeInstanceOf(ProjectDeleteConfirmationMismatchError);
    expect(repositories.projectRepository.deleteSubtree).not.toHaveBeenCalled();
  });
});
