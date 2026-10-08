import { RepositoryBrowseView } from "../repository-views";

export const dynamic = "force-dynamic";

/**
 * One named repository of the project, at Redmine's `projects/:id/repository/:repository_id`.
 * `repositoryId` is Redmine's `identifier_param`: the repository's identifier, or its id when
 * it has none. The identifier format (domain/scm/identifier.ts) excludes every static segment
 * that sits beside this one, so a repository can never shadow `blame` or `revisions`.
 */
export default async function NamedRepositoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string; repositoryId: string }>;
  searchParams: Promise<{ path?: string; ref?: string }>;
}) {
  const { identifier, repositoryId } = await params;
  const { path, ref } = await searchParams;
  return <RepositoryBrowseView projectIdentifier={identifier} repositoryParam={repositoryId} path={path} revision={ref} />;
}
