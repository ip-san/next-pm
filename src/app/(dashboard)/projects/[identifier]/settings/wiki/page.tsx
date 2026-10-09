import { notFound } from "next/navigation";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { can } from "@/domain/authorization/authorization-service";
import { DEFAULT_WIKI_START_PAGE } from "@/domain/wiki/entity";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleWikiPageRepository, DrizzleWikiRepository } from "@/infrastructure/db/repositories/wiki-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ProjectSettingsTabs } from "../../../project-settings-tabs";
import { DeleteProjectWikiForm, WikiStartPageForm } from "./wiki-settings-form";

export const dynamic = "force-dynamic";

/** Redmine's project settings "Wiki" tab plus the WikisController#destroy confirmation. */
export default async function WikiSettingsPage({ params }: { params: Promise<{ identifier: string }> }) {
  const locale = await currentLocale();
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  const projectContext = toAuthorizationProject(project);
  if (!can({ permission: "manage_wiki", project: projectContext, actor })) {
    notFound();
  }

  const [wiki, pages] = await Promise.all([
    new DrizzleWikiRepository().findByProject(project.id),
    new DrizzleWikiPageRepository().listForProject(project.id),
  ]);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{interpolate(translate(locale, "projectSettings.wikiTitle"), { project: project.name })}</h1>
      <ProjectSettingsTabs locale={locale}
        identifier={identifier}
        active="wiki"
        visibleTabs={{
          settings: can({ permission: "edit_project", project: projectContext, actor }),
          members: can({ permission: "manage_members", project: projectContext, actor }),
          wiki: true,
        }}
      />
      <WikiStartPageForm locale={locale}
        projectId={project.id}
        projectIdentifier={identifier}
        startPage={wiki?.startPage ?? DEFAULT_WIKI_START_PAGE}
      />
      <section className="flex flex-col gap-3 border-t pt-6">
        <h2 className="font-medium">{translate(locale, "projectSettings.wikiDeleteHeading")}</h2>
        <DeleteProjectWikiForm locale={locale} projectId={project.id} projectIdentifier={identifier} pageCount={pages.length} />
      </section>
    </main>
  );
}
