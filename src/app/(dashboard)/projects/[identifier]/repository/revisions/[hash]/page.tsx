import { RepositoryRevisionView } from "../../repository-views";

export const dynamic = "force-dynamic";

/** One revision of the project's default repository — see ../../repository-views.tsx. */
export default async function RevisionDiffPage({ params }: { params: Promise<{ identifier: string; hash: string }> }) {
  const { identifier, hash } = await params;
  return <RepositoryRevisionView projectIdentifier={identifier} hash={hash} />;
}
