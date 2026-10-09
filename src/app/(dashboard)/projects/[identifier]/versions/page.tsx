import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { currentLocale } from "@/interface/http/locale";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { computeVersionProgress } from "@/domain/version/progress";
import { DrizzleIssueRepository } from "@/infrastructure/db/repositories/issue-repository";
import { DrizzleIssueStatusRepository } from "@/infrastructure/db/repositories/issue-status-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject, visibleIssueFilter } from "@/interface/http/resolve-actor";
import { ProjectSettingsTabs } from "../../project-settings-tabs";
import { VersionCreateForm } from "./version-create-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, MessageKey> = {
  open: "versions.statusOpen",
  locked: "versions.statusLocked",
  closed: "versions.statusClosed",
};
const SHARING_LABEL: Record<string, MessageKey> = {
  none: "versions.sharingNone",
  descendants: "versions.sharingDescendants",
  hierarchy: "versions.sharingHierarchy",
  tree: "versions.sharingTree",
  system: "versions.sharingSystem",
};

export default async function VersionsPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor, userGroupIds, roleIds } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "view_issues", project: projectContext, actor })) {
    notFound();
  }
  const canManageVersions = can({ permission: "manage_versions", project: projectContext, actor });
  const hasIssueTracking = project.enabledModules.includes("issue_tracking");
  const hasWiki = project.enabledModules.includes("wiki");

  const [versions, allIssues, statuses, allVersionFields] = await Promise.all([
    new DrizzleVersionRepository().listByProject(project.id),
    new DrizzleIssueRepository().listByProject(project.id),
    new DrizzleIssueStatusRepository().listAll(),
    new DrizzleCustomFieldRepository().listForCustomizedType("Version"),
  ]);
  const customFieldViewer = customFieldViewerFor(user, roleIds);
  const versionFields = visibleCustomFieldsFor(allVersionFields, customFieldViewer);
  const versionValues = new Map(
    await Promise.all(
      versions.map(async (version) => [
        version.id,
        new Map((await new DrizzleCustomValueRepository().listForCustomized("Version", version.id)).map((v) => [v.customFieldId, v.value])),
      ] as const),
    ),
  );
  const issues = allIssues.filter(visibleIssueFilter(user?.id ?? null, actor, userGroupIds));
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translate(locale, "versions.title")}</h1>
        <Link href={`/projects/${identifier}/roadmap`} className="text-sm underline">
          {translate(locale, "versions.viewRoadmap")}
        </Link>
      </div>
      <ProjectSettingsTabs locale={locale}
        identifier={identifier}
        active="versions"
        visibleTabs={{
          settings: can({ permission: "edit_project", project: projectContext, actor }),
          members: can({ permission: "manage_members", project: projectContext, actor }),
          versions: true,
          issueCategories: hasIssueTracking && can({ permission: "manage_issue_categories", project: projectContext, actor }),
          repositories: can({ permission: "manage_repository", project: projectContext, actor }),
          activities: can({ permission: "manage_project_activities", project: projectContext, actor }),
          wiki: hasWiki && can({ permission: "manage_wiki", project: projectContext, actor }),
        }}
      />

      <table className="text-sm w-full">
        <thead>
          <tr className="text-left border-b">
            <th className="pb-2">{translate(locale, "versions.name")}</th>
            <th className="pb-2">{translate(locale, "versions.dueDate")}</th>
            <th className="pb-2">{translate(locale, "versions.status")}</th>
            <th className="pb-2">{translate(locale, "versions.sharing")}</th>
            <th className="pb-2">{translate(locale, "versions.progress")}</th>
            {canManageVersions ? <th className="pb-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const versionIssues = issues.filter((issue) => issue.fixedVersionId === version.id);
            const progress = computeVersionProgress(
              versionIssues.map((issue) => ({ isClosed: statusById.get(issue.statusId)?.isClosed ?? false, doneRatio: issue.doneRatio })),
            );
            return (
              <tr key={version.id} className="border-b">
                <td className="py-2">
                  {version.name}
                  {versionFields.map((field) =>
                    versionValues.get(version.id)?.get(field.id) ? (
                      <div key={field.id} className="text-xs text-gray-500">
                        {field.name}: {versionValues.get(version.id)?.get(field.id)?.split("\n").join(", ")}
                      </div>
                    ) : null,
                  )}
                </td>
                <td className="py-2">{version.effectiveDate ?? "-"}</td>
                <td className="py-2">{translate(locale, STATUS_LABEL[version.status])}</td>
                <td className="py-2">{translate(locale, SHARING_LABEL[version.sharing])}</td>
                <td className="py-2">{Math.round(progress.completedPercent)}%</td>
                {canManageVersions ? (
                  <td className="py-2">
                    <Link href={`/projects/${identifier}/versions/${version.id}`} className="underline">
                      {translate(locale, "issue.edit")}
                    </Link>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {canManageVersions ? <VersionCreateForm locale={locale} projectIdentifier={identifier} customFields={versionFields} /> : null}
    </main>
  );
}
