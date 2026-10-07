import { RepositoryBlameView } from "../../repository-views";

export const dynamic = "force-dynamic";

/** Blame for a file in one named repository — see ../../repository-views.tsx. */
export default async function NamedRepositoryBlamePage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string; repositoryId: string }>;
  searchParams: Promise<{ path?: string; ref?: string }>;
}) {
  const { identifier, repositoryId } = await params;
  const { path, ref } = await searchParams;
  return <RepositoryBlameView projectIdentifier={identifier} repositoryParam={repositoryId} path={path} revision={ref} />;
}
