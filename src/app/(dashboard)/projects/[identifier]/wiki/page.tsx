import { notFound, redirect } from "next/navigation";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";

const DEFAULT_START_PAGE = "Wiki";

export default async function WikiIndexPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }
  redirect(`/projects/${identifier}/wiki/${encodeURIComponent(DEFAULT_START_PAGE)}`);
}
