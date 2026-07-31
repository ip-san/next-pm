import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleVersionRepository } from "@/infrastructure/db/repositories/version-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { DeleteVersionButton } from "./delete-version-button";
import { VersionEditForm } from "./version-edit-form";

export const dynamic = "force-dynamic";

export default async function VersionDetailPage({ params }: { params: Promise<{ identifier: string; versionId: string }> }) {
  const { identifier, versionId } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const version = await new DrizzleVersionRepository().findById(versionId);
  if (!version || version.projectId !== project.id) {
    notFound();
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">バージョンを編集</h1>
      <VersionEditForm projectIdentifier={identifier} version={version} />
      <div className="border-t pt-4">
        <DeleteVersionButton projectIdentifier={identifier} versionId={version.id} />
      </div>
    </main>
  );
}
