import Link from "next/link";
import { currentLocale } from "@/interface/http/locale";
import { interpolate, translate } from "@/domain/i18n/messages";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { memberUserIds } from "@/domain/member/entity";
import { DrizzleChangesetRepository } from "@/infrastructure/db/repositories/changeset-repository";
import { DrizzleMemberRepository } from "@/infrastructure/db/repositories/member-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleScmRepositoryRepository } from "@/infrastructure/db/repositories/scm-repository-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { repositoryLabel } from "../../../repository/repository-views";
import { CommittersForm, type AssignableUser, type CommitterRow } from "./committers-form";

export const dynamic = "force-dynamic";

/**
 * Redmine's RepositoriesController#committers. The committer list is derived from the
 * repository's changesets, so it is empty until the repository has been synced at least once.
 */
export default async function CommittersPage({ params }: { params: Promise<{ identifier: string; repositoryId: string }> }) {
  const locale = await currentLocale();
  const { identifier, repositoryId } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_repository", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  // Keyed by id here, not by identifier_param: this is a settings screen reached from the
  // repositories tab, the same way Redmine's shallow /repositories/:id/committers route is.
  const scmRepository = await new DrizzleScmRepositoryRepository().findById(repositoryId);
  if (!scmRepository || scmRepository.projectId !== project.id) {
    notFound();
  }

  const changesetRepository = new DrizzleChangesetRepository();
  const [mappings, changesets, projectMembers] = await Promise.all([
    changesetRepository.listCommitters(scmRepository.id),
    changesetRepository.listByScmRepository(scmRepository.id),
    new DrizzleMemberRepository().listByProject(project.id),
  ]);

  const countByCommitter = new Map<string, number>();
  for (const changeset of changesets) {
    countByCommitter.set(changeset.committerIdentity, (countByCommitter.get(changeset.committerIdentity) ?? 0) + 1);
  }
  const committers: CommitterRow[] = mappings.map((mapping) => ({
    ...mapping,
    changesetCount: countByCommitter.get(mapping.committerIdentity) ?? 0,
  }));

  // Redmine's `@users`: the project's members, plus anyone already mapped who is no longer one
  // — otherwise saving the form would silently drop their mapping for want of an option.
  const alreadyMappedIds = mappings.flatMap((mapping) => (mapping.userId ? [mapping.userId] : []));
  const candidateIds = [...new Set([...memberUserIds(projectMembers), ...alreadyMappedIds])];
  const users: AssignableUser[] = (await new DrizzleUserRepository().findByIds(candidateIds))
    .map((candidate) => ({ id: candidate.id, label: `${candidate.lastname} ${candidate.firstname} (${candidate.login})` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <main className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {interpolate(translate(locale, "repository.committersTitle"), { project: project.name, repository: repositoryLabel(scmRepository, locale) })}
        </h1>
        <Link href={`/projects/${identifier}/repositories`} className="underline text-sm">
          {translate(locale, "repository.settingsLink")}
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        {translate(locale, "repository.committersHelp")}
      </p>
      {committers.length === 0 ? (
        <p className="text-sm text-gray-500">{translate(locale, "repository.noCommits")}</p>
      ) : (
        <CommittersForm locale={locale} projectIdentifier={identifier} scmRepositoryId={scmRepository.id} committers={committers} users={users} />
      )}
    </main>
  );
}
