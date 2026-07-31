import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { ProjectForm } from "./project-form";

// See admin/issue-statuses/page.tsx — same reasoning, opt out of static prerendering.
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const [projects, trackers] = await Promise.all([
    new DrizzleProjectRepository().listAll(),
    new DrizzleTrackerRepository().listAll(),
  ]);

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">新しいプロジェクト</h1>
      <ProjectForm projects={projects} trackers={trackers} />
    </main>
  );
}
