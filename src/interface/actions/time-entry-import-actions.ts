"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { parseCsv } from "@/domain/csv/decode";
import { validateCustomFieldValues } from "@/domain/custom-field/coerce";
import { CustomFieldValidationError } from "@/domain/custom-field/errors";
import { isPrivateIssueVisible } from "@/domain/issue/visibility";
import { listAssignableTimeEntryUsers } from "@/application/time-entries/assignable-users";
import { InvalidTimeEntryError, logTime } from "@/application/time-entries/log-time";
import { setTimeEntryCustomFieldValues } from "@/application/time-entries/set-time-entry-custom-field-values";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleRoleRepository } from "@/infrastructure/db/repositories/role-repository";
import { DrizzleSettingsRepository } from "@/infrastructure/db/repositories/settings-repository";
import { DrizzleTimeEntryRepository } from "@/infrastructure/db/repositories/time-entry-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { issuesVisibilityRoles, resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ImportTimeEntriesActionState = {
  error: string | null;
  summary: { created: number; failed: number; rowErrors: string[] } | null;
};

const importTimeEntriesSchema = z.object({
  projectIdentifier: z.string().min(1),
});

const REQUIRED_HEADERS = ["spent_on", "hours"];

// Mirrors TimeEntryImport's AUTO_MAPPABLE_FIELDS (spent_on, hours, activity, user, issue_id,
// comments) plus TimeEntry custom fields matched by field name, reduced to the same
// single-step upload shape as the issue importer — no multi-step mapping wizard, no
// date/quote settings. Authorization follows TimeEntryImport.authorized?: import_time_entries
// AND log_time. Attributing a row to someone other than the importer additionally needs
// log_time_for_other_users and a target in assignable_users, exactly as build_object does
// (an importer without the permission silently gets their own id there; here a `user` column
// they aren't allowed to honor is a row error instead of a silent reattribution, so a CSV is
// never imported as something other than what it says).
export async function importTimeEntriesCsvAction(
  _prevState: ImportTimeEntriesActionState,
  formData: FormData,
): Promise<ImportTimeEntriesActionState> {
  const parsed = importTimeEntriesSchema.safeParse({ projectIdentifier: formData.get("projectIdentifier") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。", summary: null };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "CSVファイルを選択してください。", summary: null };
  }

  const user = await currentUserFromCookies();
  if (!user) {
    return { error: "ログインしてください。", summary: null };
  }

  const project = await new DrizzleProjectRepository().findByIdentifier(parsed.data.projectIdentifier);
  if (!project) {
    return { error: "プロジェクトが見つかりません。", summary: null };
  }

  const projectContext = toAuthorizationProject(project);
  const { actor, userGroupIds } = await resolveActor(user, project.id);
  if (
    !can({ permission: "import_time_entries", project: projectContext, actor }) ||
    !can({ permission: "log_time", project: projectContext, actor })
  ) {
    return { error: "この操作を行う権限がありません。", summary: null };
  }
  const canLogForOthers = can({ permission: "log_time_for_other_users", project: projectContext, actor });

  const rows = parseCsv(await file.text()).filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length === 0) {
    return { error: "CSVにデータがありません。", summary: null };
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const missingRequired = REQUIRED_HEADERS.filter((required) => !header.includes(required));
  if (missingRequired.length > 0) {
    return { error: `必須列が見つかりません: ${missingRequired.join(", ")}`, summary: null };
  }
  const columnIndex = new Map(header.map((name, index) => [name, index]));

  const [activities, customFields, assignableUsers] = await Promise.all([
    new DrizzleEnumerationRepository().listByType("TimeEntryActivity"),
    new DrizzleCustomFieldRepository().listForCustomizedType("TimeEntry"),
    canLogForOthers
      ? listAssignableTimeEntryUsers(
          {
            memberRepository: new DrizzleMemberRepository(),
            roleRepository: new DrizzleRoleRepository(),
            userRepository: new DrizzleUserRepository(),
          },
          project.id,
          user,
        )
      : Promise.resolve([user]),
  ]);
  const activityByName = new Map(activities.map((activity) => [activity.name.toLowerCase(), activity]));
  const defaultActivity = activities.find((activity) => activity.isDefault) ?? activities[0];
  const assignableByLogin = new Map(assignableUsers.map((candidate) => [candidate.login.toLowerCase(), candidate]));
  const customFieldByName = new Map(customFields.map((field) => [field.name.toLowerCase(), field]));

  const timeEntryRepository = new DrizzleTimeEntryRepository();
  const settingsRepository = new DrizzleSettingsRepository();
  const issueRepository = new DrizzleIssueRepository();
  const customFieldRepository = new DrizzleCustomFieldRepository();
  const customValueRepository = new DrizzleCustomValueRepository();
  const visibilityRoles = issuesVisibilityRoles(actor);

  function cell(row: string[], name: string): string {
    const index = columnIndex.get(name);
    return index !== undefined ? (row[index] ?? "").trim() : "";
  }

  let created = 0;
  const rowErrors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;

    const spentOn = cell(row, "spent_on");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) {
      rowErrors.push(`${rowNumber}行目: spent_onはYYYY-MM-DD形式で入力してください。`);
      continue;
    }

    const hours = Number(cell(row, "hours"));
    if (!Number.isFinite(hours)) {
      rowErrors.push(`${rowNumber}行目: hoursが数値ではありません。`);
      continue;
    }

    const activityName = cell(row, "activity");
    const activity = activityName.length > 0 ? activityByName.get(activityName.toLowerCase()) : defaultActivity;
    if (!activity) {
      rowErrors.push(`${rowNumber}行目: 作業分類「${activityName}」が見つかりません。`);
      continue;
    }

    const login = cell(row, "user");
    let userId = user.id;
    if (login.length > 0) {
      const target = assignableByLogin.get(login.toLowerCase());
      if (!target) {
        rowErrors.push(`${rowNumber}行目: ユーザー「${login}」に工数を記録できません。`);
        continue;
      }
      if (target.id !== user.id && !canLogForOthers) {
        rowErrors.push(`${rowNumber}行目: 他のユーザー名義で工数を記録する権限がありません。`);
        continue;
      }
      userId = target.id;
    }

    const rawIssueId = cell(row, "issue_id");
    let issueId: string | null = null;
    if (rawIssueId.length > 0) {
      const issue = await issueRepository.findById(rawIssueId);
      if (
        !issue ||
        issue.projectId !== project.id ||
        !isPrivateIssueVisible(issue, user.id, userGroupIds, visibilityRoles)
      ) {
        rowErrors.push(`${rowNumber}行目: チケット「${rawIssueId}」が見つかりません。`);
        continue;
      }
      issueId = issue.id;
    }

    const rawCustomValues: Record<string, string> = {};
    for (const [name, field] of customFieldByName) {
      const value = cell(row, name);
      if (value.length > 0) {
        rawCustomValues[field.id] = value;
      }
    }
    // Checked before the entry is created, not after: setTimeEntryCustomFieldValues runs as
    // a second write, so a value rejected there would leave a half-imported entry behind.
    const { fieldErrors } = validateCustomFieldValues(customFields, rawCustomValues);
    if (Object.keys(fieldErrors).length > 0) {
      rowErrors.push(`${rowNumber}行目: ${Object.values(fieldErrors)[0]}`);
      continue;
    }

    try {
      const entry = await logTime(
        { timeEntryRepository, settingsRepository },
        {
          projectId: project.id,
          issueId,
          userId,
          authorId: user.id,
          activityId: activity.id,
          hours,
          comments: cell(row, "comments"),
          spentOn,
        },
      );
      await setTimeEntryCustomFieldValues({ customFieldRepository, customValueRepository }, entry.id, rawCustomValues);
      created++;
    } catch (error) {
      if (error instanceof InvalidTimeEntryError) {
        rowErrors.push(`${rowNumber}行目: ${error.message}`);
        continue;
      }
      if (error instanceof CustomFieldValidationError) {
        rowErrors.push(`${rowNumber}行目: ${Object.values(error.fieldErrors)[0] ?? "カスタムフィールドの値が不正です。"}`);
        continue;
      }
      rowErrors.push(`${rowNumber}行目: ${error instanceof Error ? error.message : "作成に失敗しました。"}`);
    }
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/time-entries`);
  return { error: null, summary: { created, failed: rowErrors.length, rowErrors } };
}
