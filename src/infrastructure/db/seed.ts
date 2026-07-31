import { db } from "./client";
import { users } from "./schema/users";
import { roles } from "./schema/roles";
import { issueStatuses } from "./schema/issue-statuses";
import { enumerations } from "./schema/enumerations";
import { trackers } from "./schema/trackers";
import { workflowTransitions } from "./schema/workflow-transitions";
import { ROLE_BUILTIN_ANONYMOUS, ROLE_BUILTIN_NON_MEMBER } from "@/domain/role/entity";
import { generateSalt, hashPassword } from "@/domain/user/password";

async function seed() {
  console.log("Seeding admin user (login: admin / password: admin — change it after first login)...");
  const adminSalt = generateSalt();
  const [admin] = await db
    .insert(users)
    .values({
      login: "admin",
      mail: "admin@example.com",
      firstname: "Admin",
      lastname: "User",
      isAdmin: true,
      status: "active",
      passwordSalt: adminSalt,
      passwordHash: hashPassword("admin", adminSalt),
      mustChangePassword: true,
    })
    .returning();

  console.log("Seeding builtin roles...");
  const [nonMember] = await db
    .insert(roles)
    .values({ name: "Non member", builtin: ROLE_BUILTIN_NON_MEMBER, permissions: ["view_issues"] })
    .returning();
  const [anonymous] = await db
    .insert(roles)
    .values({ name: "Anonymous", builtin: ROLE_BUILTIN_ANONYMOUS, permissions: ["view_issues"] })
    .returning();
  const [manager] = await db
    .insert(roles)
    .values({
      name: "Manager",
      permissions: [
        "view_project",
        "view_issues",
        "add_issues",
        "edit_issues",
        "edit_own_issues",
        "manage_issue_relations",
        "manage_issue_categories",
        "view_time_entries",
        "log_time",
        "view_wiki_pages",
        "edit_wiki_pages",
        "manage_boards",
        "view_messages",
        "add_messages",
        "edit_messages",
        "delete_messages",
        "view_news",
        "manage_news",
        "comment_news",
        "view_files",
        "manage_files",
        "browse_repository",
        "view_changesets",
        "manage_repository",
      ],
    })
    .returning();

  console.log("Seeding issue statuses...");
  const [newStatus, inProgress, resolved, closedStatus] = await db
    .insert(issueStatuses)
    .values([
      { name: "New", isClosed: false, position: 1 },
      { name: "In Progress", isClosed: false, defaultDoneRatio: 50, position: 2 },
      { name: "Resolved", isClosed: false, defaultDoneRatio: 90, position: 3 },
      { name: "Closed", isClosed: true, defaultDoneRatio: 100, position: 4 },
    ])
    .returning();

  console.log("Seeding issue priorities...");
  await db.insert(enumerations).values([
    { type: "IssuePriority", name: "Low", position: 1 },
    { type: "IssuePriority", name: "Normal", position: 2, isDefault: 1 },
    { type: "IssuePriority", name: "High", position: 3 },
    { type: "IssuePriority", name: "Urgent", position: 4 },
    { type: "IssuePriority", name: "Immediate", position: 5 },
  ]);

  console.log("Seeding default time-entry activities...");
  await db.insert(enumerations).values([
    { type: "TimeEntryActivity", name: "Design", position: 1 },
    { type: "TimeEntryActivity", name: "Development", position: 2, isDefault: 1 },
  ]);

  console.log("Seeding trackers...");
  const [bug, feature, support] = await db
    .insert(trackers)
    .values([
      { name: "Bug", defaultStatusId: newStatus.id, position: 1 },
      { name: "Feature", defaultStatusId: newStatus.id, position: 2 },
      { name: "Support", defaultStatusId: newStatus.id, position: 3 },
    ])
    .returning();

  console.log("Seeding workflow transitions for the Manager role...");
  const transitionsFor = (trackerId: string) => [
    { trackerId, roleId: manager.id, oldStatusId: newStatus.id, newStatusId: inProgress.id },
    { trackerId, roleId: manager.id, oldStatusId: inProgress.id, newStatusId: resolved.id },
    { trackerId, roleId: manager.id, oldStatusId: resolved.id, newStatusId: closedStatus.id },
    { trackerId, roleId: manager.id, oldStatusId: resolved.id, newStatusId: inProgress.id },
    { trackerId, roleId: manager.id, oldStatusId: newStatus.id, newStatusId: closedStatus.id },
  ];
  await db
    .insert(workflowTransitions)
    .values([bug, feature, support].flatMap((tracker) => transitionsFor(tracker.id)));

  console.log("Seed complete:", {
    admin: { login: admin.login, id: admin.id },
    roles: { nonMember: nonMember.id, anonymous: anonymous.id, manager: manager.id },
    trackers: { bug: bug.id, feature: feature.id, support: support.id },
  });
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
