import { describe, expect, it, mock } from "bun:test";
import { createProject, CreateProjectNotPermittedError, type CreateProjectInput } from "./create-project";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import type { MemberRepository } from "@/domain/member/repository";
import type { Project } from "@/domain/project/entity";
import type { ProjectRepository } from "@/domain/project/repository";
import type { Role } from "@/domain/role/entity";
import type { RoleRepository } from "@/domain/role/repository";
import type { SettingsRepository } from "@/domain/settings/repository";

function makeProjectRepository(overrides: Partial<ProjectRepository> = {}): ProjectRepository {
  return {
    findById: mock(async () => null),
    findByIdentifier: mock(async () => null),
    listAll: mock(async () => []),
    listNestedSetNodes: mock(async () => []),
    listDescendants: mock(async () => []),
    updateStatus: mock(async () => {}),
    deleteSubtree: mock(async () => ({ removedProjectIds: [], attachmentStorageKeys: [] })),
    createUnderParent: mock(async (project) => ({ ...project, id: "new-id", lft: 1, rgt: 2 }) as Project),
    copySkeletonFrom: mock(async (_sourceProjectId, project) => ({ ...project, id: "new-id", lft: 1, rgt: 2 }) as Project),
    updateSettings: mock(async (id, settings) => ({ id, lft: 1, rgt: 2, status: "active", parentId: null, position: 0, identifier: "", ...settings }) as Project),
    ...overrides,
  };
}

function role(name: string, permissions: Role["permissions"]): Role {
  return {
    id: `role-${name}`,
    name,
    builtin: 0,
    position: 0,
    permissions,
    issuesVisibility: "default",
    timeEntriesVisibility: "all",
    usersVisibility: "all",
    assignable: true,
  };
}

const creatorRole = role("Creator", ["add_project"]);

function makeRepositories(options: { projectRepository?: ProjectRepository; roles?: Role[]; settings?: Record<string, string> } = {}) {
  const projectRepository = options.projectRepository ?? makeProjectRepository();
  const memberRepository = { create: mock(async () => ({ id: "member-1" })) } as unknown as MemberRepository;
  const roleRepository = { listGivable: mock(async () => options.roles ?? [creatorRole]) } as unknown as RoleRepository;
  const settingsRepository = { getAll: mock(async () => options.settings ?? {}) } as unknown as SettingsRepository;
  return { projectRepository, memberRepository, roleRepository, settingsRepository };
}

const baseInput: CreateProjectInput = {
  name: "Alpha",
  identifier: "alpha",
  description: "",
  isPublic: true,
  parentId: null,
  enabledModules: ["issue_tracking", "wiki"],
  trackerIds: [],
  actingUserId: "user-1",
  isAdmin: true,
  globalRoles: [],
  parentActor: null,
};

const parentProject: Project = {
  id: "parent",
  name: "Parent",
  identifier: "parent",
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

describe("createProject", () => {
  it("creates a project when the identifier is free", async () => {
    const repositories = makeRepositories();
    const project = await createProject(repositories, baseInput);
    expect(project.identifier).toBe("alpha");
    expect(repositories.projectRepository.createUnderParent).toHaveBeenCalled();
  });

  it("rejects a duplicate identifier", async () => {
    const repositories = makeRepositories({
      projectRepository: makeProjectRepository({ findByIdentifier: mock(async () => ({ identifier: "alpha" }) as Project) }),
    });
    await expect(createProject(repositories, baseInput)).rejects.toThrow(/already taken/);
  });

  it("refuses a non-admin who holds add_project nowhere", async () => {
    const repositories = makeRepositories();
    await expect(createProject(repositories, { ...baseInput, isAdmin: false, globalRoles: [] })).rejects.toBeInstanceOf(
      CreateProjectNotPermittedError,
    );
  });

  it("lets a non-admin holding add_project anywhere create a root project", async () => {
    const repositories = makeRepositories();
    await createProject(repositories, { ...baseInput, isAdmin: false, globalRoles: [creatorRole] });
    expect(repositories.projectRepository.createUnderParent).toHaveBeenCalled();
  });

  it("requires add_subprojects on the parent rather than add_project", async () => {
    const repositories = makeRepositories({
      projectRepository: makeProjectRepository({ findById: mock(async () => parentProject) }),
    });
    const withParent = { ...baseInput, isAdmin: false, parentId: "parent", globalRoles: [creatorRole] };

    await expect(
      createProject(repositories, { ...withParent, parentActor: { kind: "member", roles: [creatorRole] } }),
    ).rejects.toBeInstanceOf(CreateProjectNotPermittedError);

    const subprojectActor: AuthorizationActor = { kind: "member", roles: [role("Sub", ["add_subprojects"])] };
    await createProject(repositories, { ...withParent, parentActor: subprojectActor });
    expect(repositories.projectRepository.createUnderParent).toHaveBeenCalledTimes(1);
  });

  it("adds a non-admin creator as a member with the default member role", async () => {
    const configured = role("Configured", ["add_project"]);
    const repositories = makeRepositories({
      roles: [creatorRole, configured],
      settings: { new_project_user_role_id: configured.id },
    });

    await createProject(repositories, { ...baseInput, isAdmin: false, globalRoles: [creatorRole] });
    expect(repositories.memberRepository.create).toHaveBeenCalledWith({
      userId: "user-1",
      groupId: null,
      inheritedFromMemberId: null,
      projectId: "new-id",
      roleIds: [configured.id],
    });
  });

  it("does not add an admin creator as a member, matching add_default_member's unless admin?", async () => {
    const repositories = makeRepositories();
    await createProject(repositories, baseInput);
    expect(repositories.memberRepository.create).not.toHaveBeenCalled();
  });

  it("falls back to the default settings when the creator's role may not choose publicity or modules", async () => {
    const repositories = makeRepositories({
      roles: [creatorRole],
      settings: { default_projects_public: "0", default_projects_modules: "news,files" },
    });

    await createProject(repositories, { ...baseInput, isAdmin: false, isPublic: true, globalRoles: [creatorRole] });
    expect(repositories.projectRepository.createUnderParent).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: false, enabledModules: ["news", "files"] }),
      null,
    );
  });

  it("honours the submitted publicity and modules when the creator's role may choose them", async () => {
    const chooser = role("Chooser", ["add_project", "select_project_publicity", "select_project_modules"]);
    const repositories = makeRepositories({ roles: [chooser], settings: { default_projects_public: "0" } });

    await createProject(repositories, { ...baseInput, isAdmin: false, isPublic: true, globalRoles: [chooser] });
    expect(repositories.projectRepository.createUnderParent).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: true, enabledModules: ["issue_tracking", "wiki"] }),
      null,
    );
  });
});
