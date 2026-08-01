import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleTrackerRepository } from "@/infrastructure/db/repositories/tracker-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { ProjectSettingsForm } from "./project-settings-form";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "edit_project", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const trackers = await new DrizzleTrackerRepository().listAll();

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{project.name} — 設定</h1>
      <ProjectSettingsForm project={project} trackers={trackers} />
    </main>
  );
}
