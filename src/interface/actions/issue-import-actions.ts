"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { parseCsv } from "@/domain/csv/decode";
import { createIssue } from "@/application/issues/create-issue";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ImportIssuesActionState = {
  error: string | null;
  summary: { created: number; failed: number; rowErrors: string[] } | null;
};

const importIssuesSchema = z.object({
  projectIdentifier: z.string().min(1),
});

const REQUIRED_HEADERS = ["subject"];

// Mirrors the scope of Redmine's issue CSV import (ImportsController) reduced to what this
// app's createIssue already supports: subject is required, tracker/priority are matched by
// name (case-insensitive) with a default fallback, assignee is matched by login. Custom
// fields and other import wizard steps (field mapping UI, date/quote settings) are
// deliberately out of scope — this is a single-step upload, not the full multi-step wizard.
export async function importIssuesCsvAction(_prevState: ImportIssuesActionState, formData: FormData): Promise<ImportIssuesActionState> {
  const parsed = importIssuesSchema.safeParse({ projectIdentifier: formData.get("projectIdentifier") });
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

  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "add_issues", project: toAuthorizationProject(project), actor })) {
    return { error: "この操作を行う権限がありません。", summary: null };
  }

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

  const [trackers, priorities] = await Promise.all([
    new DrizzleTrackerRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
  ]);
  const trackerByName = new Map(trackers.map((t) => [t.name.toLowerCase(), t]));
  const priorityByName = new Map(priorities.map((p) => [p.name.toLowerCase(), p]));
  const defaultPriority = priorities.find((p) => p.isDefault) ?? priorities[0];

  const issueRepository = new DrizzleIssueRepository();
  const trackerRepository = new DrizzleTrackerRepository();
  const userRepository = new DrizzleUserRepository();

  function cell(row: string[], name: string): string {
    const index = columnIndex.get(name);
    return index !== undefined ? (row[index] ?? "").trim() : "";
  }

  let created = 0;
  const rowErrors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    const subject = cell(row, "subject");
    if (subject.length === 0) {
      rowErrors.push(`${rowNumber}行目: subjectが空です。`);
      continue;
    }

    const trackerName = cell(row, "tracker");
    const tracker = trackerName.length > 0 ? trackerByName.get(trackerName.toLowerCase()) : trackers[0];
    if (!tracker) {
      rowErrors.push(`${rowNumber}行目: トラッカー「${trackerName}」が見つかりません。`);
      continue;
    }

    const priorityName = cell(row, "priority");
    const priority = priorityName.length > 0 ? priorityByName.get(priorityName.toLowerCase()) : defaultPriority;
    if (!priority) {
      rowErrors.push(`${rowNumber}行目: 優先度「${priorityName}」が見つかりません。`);
      continue;
    }

    const assigneeLogin = cell(row, "assignee");
    let assignedToId: string | null = null;
    if (assigneeLogin.length > 0) {
      const assignee = await userRepository.findByLogin(assigneeLogin);
      if (!assignee) {
        rowErrors.push(`${rowNumber}行目: 担当者「${assigneeLogin}」が見つかりません。`);
        continue;
      }
      assignedToId = assignee.id;
    }

    try {
      await createIssue(
        { issueRepository, trackerRepository },
        {
          projectId: project.id,
          trackerId: tracker.id,
          priorityId: priority.id,
          subject,
          description: cell(row, "description"),
          authorId: user.id,
          assignedToId,
          parentId: null,
          fixedVersionId: null,
          categoryId: null,
          isPrivate: false,
          estimatedHours: null,
          startDate: null,
          dueDate: null,
        },
      );
      created++;
    } catch (error) {
      rowErrors.push(`${rowNumber}行目: ${error instanceof Error ? error.message : "作成に失敗しました。"}`);
    }
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues`);
  return { error: null, summary: { created, failed: rowErrors.length, rowErrors } };
}
