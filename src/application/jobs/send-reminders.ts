import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import type { Issue } from "@/domain/issue/entity";
import type { IssueRepository } from "@/domain/issue/repository";
import type { IssueStatusRepository } from "@/domain/issue-status/repository";
import type { GroupRepository } from "@/domain/group/repository";
import type { Mailer } from "@/domain/mailer/port";
import type { MemberRepository } from "@/domain/member/repository";
import type { ProjectRepository } from "@/domain/project/repository";
import type { RoleRepository } from "@/domain/role/repository";
import type { UserRepository } from "@/domain/user/repository";

export const REMINDERS_JOB_TYPE = "reminders";

export interface RemindersJobPayload {
  /** Window in days, as Redmine's `rake redmine:send_reminders days=` (default 7). */
  days?: number;
  /** Restrict to one project (and only that project, matching Redmine's `project=`). */
  projectId?: string | null;
  trackerId?: string | null;
  /** Restrict to these assignees, as Redmine's `users=`. */
  userIds?: string[];
}

export interface RemindersRepositories {
  issueRepository: IssueRepository;
  issueStatusRepository: IssueStatusRepository;
  projectRepository: ProjectRepository;
  memberRepository: MemberRepository;
  roleRepository: RoleRepository;
  groupRepository: GroupRepository;
  userRepository: UserRepository;
  mailer: Mailer;
}

export const DEFAULT_REMINDER_DAYS = 7;

function cutoffDate(days: number, today: Date): string {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + days);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Port of Redmine's `Mailer.reminders` (the `redmine:send_reminders` rake task). next-pm has
 * no scheduler — see docs/parity-checklist.md §15 — so this runs as an on-demand job an admin
 * enqueues from the settings screen, which is the same thing Redmine's cron entry does, just
 * with a human or an external scheduler pulling the trigger.
 *
 * Same selection as Redmine: open issues in active projects that have an assignee and a due
 * date within the window, grouped per assignee, with group assignees expanded to their users
 * and each recipient's own visibility applied before the mail is built.
 */
export async function sendReminders(
  repositories: RemindersRepositories,
  payload: RemindersJobPayload,
  today: Date = new Date(),
): Promise<{ recipients: number; issues: number }> {
  const days = payload.days && payload.days > 0 ? payload.days : DEFAULT_REMINDER_DAYS;
  const cutoff = cutoffDate(days, today);

  const statuses = await repositories.issueStatusRepository.listAll();
  const closedStatusIds = new Set(statuses.filter((status) => status.isClosed).map((status) => status.id));

  const allProjects = await repositories.projectRepository.listAll();
  const projects = allProjects.filter(
    (project) => project.status === "active" && (!payload.projectId || project.id === payload.projectId),
  );

  const issuesByUser = new Map<string, Issue[]>();
  const projectNames = new Map<string, string>();

  for (const project of projects) {
    projectNames.set(project.id, project.name);
    const members = await repositories.memberRepository.listByProject(project.id);
    const rolesById = new Map(
      (await repositories.roleRepository.findByIds([...new Set(members.flatMap((member) => member.roleIds))])).map(
        (role) => [role.id, role],
      ),
    );

    const issues = (await repositories.issueRepository.listByProject(project.id)).filter(
      (issue) =>
        issue.assignedToId !== null &&
        issue.dueDate !== null &&
        issue.dueDate <= cutoff &&
        !closedStatusIds.has(issue.statusId) &&
        (!payload.trackerId || issue.trackerId === payload.trackerId),
    );

    for (const issue of issues) {
      const assignees =
        issue.assignedToType === "group" && issue.assignedToId
          ? await repositories.groupRepository.listUserIds(issue.assignedToId)
          : [issue.assignedToId as string];

      for (const userId of assignees) {
        if (payload.userIds && payload.userIds.length > 0 && !payload.userIds.includes(userId)) continue;
        const roles = members
          .filter((member) => member.userId === userId)
          .flatMap((member) => member.roleIds.flatMap((roleId) => {
            const role = rolesById.get(roleId);
            return role ? [role] : [];
          }));
        if (!isPrivateIssueVisible(issue, userId, [], roles)) continue;

        const list = issuesByUser.get(userId) ?? [];
        list.push(issue);
        issuesByUser.set(userId, list);
      }
    }
  }

  let recipients = 0;
  let reminded = 0;
  for (const [userId, issues] of issuesByUser) {
    const user = await repositories.userRepository.findById(userId);
    if (!user || user.status !== "active") continue;

    issues.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || a.id.localeCompare(b.id));
    const lines = issues.map(
      (issue) => `- ${issue.dueDate} [${projectNames.get(issue.projectId) ?? ""} #${issue.id.slice(0, 8)}] ${issue.subject}`,
    );
    await repositories.mailer.send({
      to: [user.mail],
      subject: `期日が近づいているチケットが ${issues.length} 件あります`,
      body: [`${days}日以内に期日を迎える、あなたが担当のチケットです。`, "", ...lines].join("\n"),
    });
    recipients += 1;
    reminded += issues.length;
  }

  return { recipients, issues: reminded };
}
