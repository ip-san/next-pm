import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ImportForm } from "./import-form";

export default async function ImportIssuesPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  // Redmine's IssueImport#authorized?: both import_issues and add_issues.
  if (!can({ permission: "import_issues", project: projectContext, actor }) || !can({ permission: "add_issues", project: projectContext, actor })) {
    notFound();
  }
  const canManageCategories = can({ permission: "manage_issue_categories", project: projectContext, actor });
  const canManageVersions = can({ permission: "manage_versions", project: projectContext, actor });

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{interpolate(translate(locale, "issueImport.title"), { project: project.name })}</h1>
        <Link href={`/projects/${identifier}/issues`} className="underline text-sm">
          {translate(locale, "issueImport.issueList")}
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        {translate(locale, "issueImport.intro")}
        <code className="font-mono">subject</code>
        {translate(locale, "issueImport.subjectNote")}
        <code className="font-mono">tracker</code>, <code className="font-mono">priority</code>, <code className="font-mono">description</code>,{" "}
        <code className="font-mono">assignee</code>
        {translate(locale, "issueImport.assigneeNote")}
        <code className="font-mono">category</code>, <code className="font-mono">fixed_version</code>,{" "}
        <code className="font-mono">is_private</code>
        {translate(locale, "issueImport.resolveNote")}
      </p>
      <ImportForm locale={locale} projectIdentifier={identifier} canManageCategories={canManageCategories} canManageVersions={canManageVersions} />
    </main>
  );
}
