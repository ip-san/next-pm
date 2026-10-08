import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ImportTimeEntriesForm } from "./import-form";

export default async function ImportTimeEntriesPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, roleIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  // TimeEntryImport.authorized? requires both permissions, not just import_time_entries.
  if (
    !can({ permission: "import_time_entries", project: projectContext, actor }) ||
    !can({ permission: "log_time", project: projectContext, actor })
  ) {
    notFound();
  }

  const customFields = visibleCustomFieldsFor(
    await new DrizzleCustomFieldRepository().listForCustomizedType("TimeEntry"),
    customFieldViewerFor(user, roleIds),
  );

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — 工数の取り込み (CSV)</h1>
        <Link href={`/projects/${identifier}/time-entries`} className="underline text-sm">
          工数一覧
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        1行目をヘッダー行として扱います。列名: <code className="font-mono">spent_on</code>（必須・YYYY-MM-DD）,{" "}
        <code className="font-mono">hours</code>（必須）, <code className="font-mono">activity</code>（名称。省略時は既定の作業分類）,{" "}
        <code className="font-mono">user</code>（ログインID。省略時は自分。他のユーザーを指定するには
        <code className="font-mono">log_time_for_other_users</code> 権限が必要）, <code className="font-mono">issue_id</code>
        （このプロジェクトのチケットID）, <code className="font-mono">comments</code>
        {customFields.length > 0 ? (
          <>
            。カスタムフィールドはフィールド名を列名にします: {customFields.map((field) => field.name).join(", ")}
          </>
        ) : null}
        。工数一覧のCSVエクスポートと同じ列構成なので、書き出したCSVをそのまま編集して取り込めます。
      </p>
      <ImportTimeEntriesForm projectIdentifier={identifier} />
    </main>
  );
}
