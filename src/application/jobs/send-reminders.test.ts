import { describe, expect, it, mock } from "bun:test";
import { sendReminders } from "./send-reminders";
import type { Issue } from "@/domain/issue/entity";
import type { MailMessage } from "@/domain/mailer/port";
import type { Project } from "@/domain/project/entity";
import type { Role } from "@/domain/role/entity";
import type { User } from "@/domain/user/entity";

const TODAY = new Date("2026-03-01T00:00:00.000Z");

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "11111111-aaaa-4bbb-8ccc-dddddddddddd",
    projectId: "project-1",
    trackerId: "tracker-1",
    statusId: "status-open",
    priorityId: "priority-1",
    subject: "Fix the thing",
    description: "",
    authorId: "author-1",
    assignedToId: "user-1",
    assignedToType: "user",
    parentId: null,
    fixedVersionId: null,
    categoryId: null,
    isPrivate: false,
    doneRatio: 0,
    estimatedHours: null,
    startDate: null,
    dueDate: "2026-03-03",
    lockVersion: 0,
    createdAt: TODAY,
    updatedAt: TODAY,
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    login: "alice",
    mail: "alice@example.com",
    firstname: "Alice",
    lastname: "A",
    isAdmin: false,
    status: "active",
    passwordHash: "",
    passwordSalt: "",
    mustChangePassword: false,
    apiKey: null,
    atomKey: null,
    authSource: null,
    twofaScheme: null,
    twofaTotpKey: null,
    twofaTotpLastUsedStep: null,
    language: null,
    mailNotification: "all",
    ...overrides,
  };
}

const project: Project = {
  id: "project-1",
  name: "Alpha",
  identifier: "alpha",
  description: "",
  isPublic: true,
  status: "active",
  parentId: null,
  lft: 1,
  rgt: 2,
  position: 0,
  enabledModules: ["issue_tracking"],
  trackerIds: ["tracker-1"],
};

const role: Role = {
  id: "role-1",
  name: "Member",
  builtin: 0,
  position: 1,
  permissions: ["view_issues"],
  issuesVisibility: "default",
  timeEntriesVisibility: "all",
  usersVisibility: "all",
  assignable: true,
};

function makeRepositories(options: {
  issues: Issue[];
  projects?: Project[];
  users?: User[];
  groupUserIds?: string[];
}) {
  const sent: MailMessage[] = [];
  const users = options.users ?? [makeUser()];
  return {
    sent,
    repositories: {
      issueRepository: { listByProject: mock(async () => options.issues) },
      issueStatusRepository: {
        listAll: mock(async () => [
          { id: "status-open", name: "New", isClosed: false, defaultDoneRatio: null, position: 1 },
          { id: "status-closed", name: "Closed", isClosed: true, defaultDoneRatio: null, position: 2 },
        ]),
      },
      projectRepository: { listAll: mock(async () => options.projects ?? [project]) },
      memberRepository: {
        listByProject: mock(async () =>
          users.map((user, index) => ({
            id: `member-${index}`,
            userId: user.id,
            groupId: null,
            inheritedFromMemberId: null,
            projectId: project.id,
            roleIds: [role.id],
          })),
        ),
      },
      roleRepository: { findByIds: mock(async () => [role]) },
      groupRepository: { listUserIds: mock(async () => options.groupUserIds ?? []) },
      userRepository: { findById: mock(async (id: string) => users.find((user) => user.id === id) ?? null) },
      mailer: { send: mock(async (message: MailMessage) => void sent.push(message)) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("sendReminders", () => {
  it("mails each assignee the issues due inside the window", async () => {
    const { repositories, sent } = makeRepositories({ issues: [makeIssue()] });

    const result = await sendReminders(repositories, { days: 7 }, TODAY);

    expect(result).toEqual({ recipients: 1, issues: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["alice@example.com"]);
    expect(sent[0].body).toContain("2026-03-03");
    expect(sent[0].body).toContain("Fix the thing");
  });

  it("ignores issues outside the window, closed issues and unassigned issues", async () => {
    const { repositories, sent } = makeRepositories({
      issues: [
        makeIssue({ id: "a", dueDate: "2026-04-01" }),
        makeIssue({ id: "b", statusId: "status-closed" }),
        makeIssue({ id: "c", assignedToId: null, assignedToType: null }),
        makeIssue({ id: "d", dueDate: null }),
      ],
    });

    expect(await sendReminders(repositories, {}, TODAY)).toEqual({ recipients: 0, issues: 0 });
    expect(sent).toEqual([]);
  });

  it("expands a group assignee to its users", async () => {
    const bob = makeUser({ id: "user-2", login: "bob", mail: "bob@example.com" });
    const { repositories, sent } = makeRepositories({
      issues: [makeIssue({ assignedToId: "group-1", assignedToType: "group" })],
      users: [makeUser(), bob],
      groupUserIds: ["user-1", "user-2"],
    });

    const result = await sendReminders(repositories, {}, TODAY);

    expect(result.recipients).toBe(2);
    expect(sent.flatMap((message) => message.to).sort()).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("skips a locked assignee and archived projects", async () => {
    const { repositories, sent } = makeRepositories({
      issues: [makeIssue()],
      users: [makeUser({ status: "locked" })],
    });
    expect(await sendReminders(repositories, {}, TODAY)).toEqual({ recipients: 0, issues: 0 });

    const archived = makeRepositories({ issues: [makeIssue()], projects: [{ ...project, status: "archived" }] });
    expect(await sendReminders(archived.repositories, {}, TODAY)).toEqual({ recipients: 0, issues: 0 });
    expect(sent).toEqual([]);
  });

  it("honours an explicit assignee filter", async () => {
    const { repositories, sent } = makeRepositories({ issues: [makeIssue()] });
    expect(await sendReminders(repositories, { userIds: ["someone-else"] }, TODAY)).toEqual({ recipients: 0, issues: 0 });
    expect(sent).toEqual([]);
  });
});
