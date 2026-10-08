import { RepositoryRevisionView } from "../../../repository-views";

export const dynamic = "force-dynamic";

/** One revision of one named repository — see ../../../repository-views.tsx. */
export default async function NamedRepositoryRevisionPage({
  params,
}: {
  params: Promise<{ identifier: string; repositoryId: string; hash: string }>;
}) {
  const { identifier, repositoryId, hash } = await params;
  return <RepositoryRevisionView projectIdentifier={identifier} repositoryParam={repositoryId} hash={hash} />;
}
