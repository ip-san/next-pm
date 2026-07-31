import { notFound } from "next/navigation";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { NewIssueForm } from "./new-issue-form";

export default async function NewIssuePage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const [trackers, priorities] = await Promise.all([
    new DrizzleTrackerRepository().findByIds(project.trackerIds),
    new DrizzleEnumerationRepository().listByType("IssuePriority"),
  ]);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name} — 新しいチケット</h1>
      <NewIssueForm identifier={identifier} projectId={project.id} trackers={trackers} priorities={priorities} />
    </main>
  );
}
