import { RepositoryBlameView } from "../repository-views";

export const dynamic = "force-dynamic";

/** Blame for a file in the project's default repository — see ../repository-views.tsx. */
export default async function BlamePage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ path?: string; ref?: string }>;
}) {
  const { identifier } = await params;
  const { path, ref } = await searchParams;
  return <RepositoryBlameView projectIdentifier={identifier} path={path} revision={ref} />;
}
