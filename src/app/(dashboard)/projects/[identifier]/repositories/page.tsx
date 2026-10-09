import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ProjectSettingsTabs } from "../../project-settings-tabs";
import { repositoryPath } from "../repository/repository-context";
import { repositoryLabel } from "../repository/repository-views";
import { ConnectRepositoryForm } from "./connect-repository-form";
import { DeleteRepositoryForm, UpdateRepositoryForm } from "./repository-row-forms";

export const dynamic = "force-dynamic";

const VENDOR_LABEL: Record<string, string> = { git: "Git", subversion: "Subversion", mercurial: "Mercurial" };

/** Redmine's project settings "Repositories" tab (RepositoriesController new/create/edit/update/destroy + committers). */
export default async function ProjectRepositoriesPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "manage_repository", project: projectContext, actor })) {
    notFound();
  }

  const repositories = await new DrizzleScmRepositoryRepository().listByProject(project.id);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "repository.title"), { project: project.name })}</h1>
      <ProjectSettingsTabs locale={locale}
        identifier={identifier}
        active="repositories"
        visibleTabs={{
          settings: can({ permission: "edit_project", project: projectContext, actor }),
          members: can({ permission: "manage_members", project: projectContext, actor }),
          versions: project.enabledModules.includes("issue_tracking") && can({ permission: "view_issues", project: projectContext, actor }),
          issueCategories:
            project.enabledModules.includes("issue_tracking") && can({ permission: "manage_issue_categories", project: projectContext, actor }),
          repositories: true,
        }}
      />

      {repositories.length === 0 ? (
        <p className="text-sm text-gray-500">{translate(locale, "repository.none")}</p>
      ) : (
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left border-b">
              <th className="pb-2">{translate(locale, "repository.name")}</th>
              <th className="pb-2">{translate(locale, "repository.type")}</th>
              <th className="pb-2">{translate(locale, "repository.pathOrUrl")}</th>
              <th className="pb-2">{translate(locale, "repository.settings")}</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {repositories.map((repository) => (
              <tr key={repository.id} className="border-b align-top">
                <td className="py-2">
                  <Link href={repositoryPath(identifier, repository)} className="underline">
                    {repositoryLabel(repository, locale)}
                  </Link>
                  {repository.isDefault ? <span className="ml-2 text-xs text-gray-500">{translate(locale, "repository.main")}</span> : null}
                </td>
                <td className="py-2">{VENDOR_LABEL[repository.vendor] ?? repository.vendor}</td>
                <td className="py-2 font-mono text-xs break-all">{repository.rootPath}</td>
                <td className="py-2">
                  <UpdateRepositoryForm locale={locale}
                    projectIdentifier={identifier}
                    scmRepositoryId={repository.id}
                    identifier={repository.identifier}
                    isDefault={repository.isDefault}
                  />
                </td>
                <td className="py-2">
                  <div className="flex flex-col gap-1 items-start">
                    <Link href={`/projects/${identifier}/repositories/${repository.id}/committers`} className="underline text-xs">
                      {translate(locale, "repository.committerMapping")}
                    </Link>
                    <DeleteRepositoryForm locale={locale} projectIdentifier={identifier} scmRepositoryId={repository.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConnectRepositoryForm locale={locale} projectIdentifier={identifier} isFirst={repositories.length === 0} />
    </main>
  );
}
