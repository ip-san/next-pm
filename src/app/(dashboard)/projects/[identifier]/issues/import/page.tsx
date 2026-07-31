import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ImportForm } from "./import-form";

export default async function ImportIssuesPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "add_issues", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{project.name} — チケットの取り込み (CSV)</h1>
        <Link href={`/projects/${identifier}/issues`} className="underline text-sm">
          チケット一覧
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        1行目をヘッダー行として扱います。列名: <code className="font-mono">subject</code>（必須）,{" "}
        <code className="font-mono">tracker</code>, <code className="font-mono">priority</code>,{" "}
        <code className="font-mono">description</code>, <code className="font-mono">assignee</code>
        （ログインID）。tracker・priorityは名称一致で解決され、省略時は既定値を使用します。
      </p>
      <ImportForm projectIdentifier={identifier} />
    </main>
  );
}
