"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/domain/authorization/authorization-service";
import { parseCsv } from "@/domain/csv/decode";
import { createIssue } from "@/application/issues/create-issue";
import { WorkflowRequiredFieldError } from "@/application/issues/update-issue";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleIssueCategoryRepository } from "@/infrastructure/db/repositories/issue-category-repository";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { DrizzleWorkflowFieldPermissionRepository } from "@/infrastructure/db/repositories/workflow-field-permission-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";

export type ImportIssuesActionState = {
  error: string | null;
  summary: { created: number; failed: number; rowErrors: string[] } | null;
};

const importIssuesSchema = z.object({
  projectIdentifier: z.string().min(1),
  createCategories: z.literal("on").optional(),
  createVersions: z.literal("on").optional(),
});

const REQUIRED_HEADERS = ["subject"];

// Mirrors the scope of Redmine's issue CSV import (ImportsController/IssueImport#build_object)
// reduced to what this app's createIssue already supports: subject is required, tracker/
// priority/category/fixed_version are matched by name (case-insensitive), assignee by login,
// is_private by a yes/1-style value. Custom fields and other import wizard steps (field
// mapping UI, date/quote settings) remain out of scope — this is a single-step upload, not the
// full multi-step wizard. parent_issue_id resolution (including the "refers to another row via
// unique_id" delayed-resolution case) is also not covered — that needs a two-pass import to
// handle forward references, a bigger change than this pass's column-matching additions.
export async function importIssuesCsvAction(_prevState: ImportIssuesActionState, formData: FormData): Promise<ImportIssuesActionState> {
  const parsed = importIssuesSchema.safeParse({
    projectIdentifier: formData.get("projectIdentifier"),
    createCategories: formData.get("createCategories") ?? undefined,
    createVersions: formData.get("createVersions") ?? undefined,
  });
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

  const { actor, roleIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "add_issues", project: projectContext, actor })) {
    return { error: "この操作を行う権限がありません。", summary: null };
  }
  // Mirrors Redmine's create_categories?/create_versions?: auto-creating a category or
  // version during import needs the same permission as managing them directly, not just
  // add_issues — otherwise a CSV with an unfamiliar category name would let any importer
  // silently create new categories/versions in the project.
  const canCreateCategories = parsed.data.createCategories === "on" && can({ permission: "manage_issue_categories", project: projectContext, actor });
  const canCreateVersions = parsed.data.createVersions === "on" && can({ permission: "manage_versions", project: projectContext, actor });

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

  const [trackers, priorities, categories, versions] = await Promise.all([
    new DrizzleTrackerRepository().listAll(),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
    new DrizzleIssueCategoryRepository().listByProject(project.id),
    // Own versions plus versions shared into this project — matches the same eligibility
    // rule the REST API's fixed_version_id validation uses, and Redmine's own `versions.named
    // .first || shared_versions.named.first` lookup order (shared_versions already includes
    // the project's own versions, so a single combined lookup is equivalent).
    new DrizzleVersionRepository().listSharedWith(project.id),
  ]);
  const trackerByName = new Map(trackers.map((t) => [t.name.toLowerCase(), t]));
  const priorityByName = new Map(priorities.map((p) => [p.name.toLowerCase(), p]));
  const defaultPriority = priorities.find((p) => p.isDefault) ?? priorities[0];
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const versionByName = new Map(versions.map((v) => [v.name.toLowerCase(), v]));

  const issueRepository = new DrizzleIssueRepository();
  const trackerRepository = new DrizzleTrackerRepository();
  const userRepository = new DrizzleUserRepository();
  const issueCategoryRepository = new DrizzleIssueCategoryRepository();
  const versionRepository = new DrizzleVersionRepository();
  const workflowFieldPermissionRepository = new DrizzleWorkflowFieldPermissionRepository();

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

    const categoryName = cell(row, "category");
    let categoryId: string | null = null;
    if (categoryName.length > 0) {
      let category = categoryByName.get(categoryName.toLowerCase());
      if (!category && canCreateCategories) {
        category = await issueCategoryRepository.create({ projectId: project.id, name: categoryName, assignedToId: null });
        categoryByName.set(categoryName.toLowerCase(), category);
      }
      if (!category) {
        rowErrors.push(`${rowNumber}行目: カテゴリ「${categoryName}」が見つかりません。`);
        continue;
      }
      categoryId = category.id;
    }

    const versionName = cell(row, "fixed_version");
    let fixedVersionId: string | null = null;
    if (versionName.length > 0) {
      let version = versionByName.get(versionName.toLowerCase());
      if (!version && canCreateVersions) {
        version = await versionRepository.create({
          projectId: project.id,
          name: versionName,
          description: "",
          effectiveDate: null,
          status: "open",
          sharing: "none",
          wikiPageTitle: null,
        });
        versionByName.set(versionName.toLowerCase(), version);
      }
      if (!version) {
        rowErrors.push(`${rowNumber}行目: バージョン「${versionName}」が見つかりません。`);
        continue;
      }
      fixedVersionId = version.id;
    }

    const isPrivate = ["1", "yes", "true"].includes(cell(row, "is_private").toLowerCase());

    try {
      await createIssue(
        { issueRepository, trackerRepository, workflowFieldPermissionRepository },
        {
          projectId: project.id,
          trackerId: tracker.id,
          priorityId: priority.id,
          subject,
          description: cell(row, "description"),
          authorId: user.id,
          assignedToId,
          assignedToType: assignedToId ? "user" : null,
          parentId: null,
          fixedVersionId,
          categoryId,
          isPrivate,
          estimatedHours: null,
          startDate: null,
          dueDate: null,
          actorRoleIds: roleIds,
        },
      );
      created++;
    } catch (error) {
      if (error instanceof WorkflowRequiredFieldError) {
        rowErrors.push(`${rowNumber}行目: このステータスでは必須項目が未入力です。`);
        continue;
      }
      rowErrors.push(`${rowNumber}行目: ${error instanceof Error ? error.message : "作成に失敗しました。"}`);
    }
  }

  revalidatePath(`/projects/${parsed.data.projectIdentifier}/issues`);
  return { error: null, summary: { created, failed: rowErrors.length, rowErrors } };
}
