import { customFieldViewerFor } from "@/interface/http/custom-field-viewer";
import { visibleCustomFieldsFor } from "@/domain/custom-field/visibility";
import { DrizzleCustomFieldRepository } from "@/infrastructure/db/repositories/custom-field-repository";
import { DrizzleCustomValueRepository } from "@/infrastructure/db/repositories/custom-value-repository";
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
  const { actor, roleIds } = await resolveActor(user, project.id);
  if (!can({ permission: "manage_versions", project: toAuthorizationProject(project), actor })) {
    notFound();
  }

  const version = await new DrizzleVersionRepository().findById(versionId);
  if (!version || version.projectId !== project.id) {
    notFound();
  }

  const [allFields, values] = await Promise.all([
    new DrizzleCustomFieldRepository().listForCustomizedType("Version"),
    new DrizzleCustomValueRepository().listForCustomized("Version", version.id),
  ]);
  const customFields = visibleCustomFieldsFor(allFields, customFieldViewerFor(user, roleIds));
  const visibleIds = new Set(customFields.map((field) => field.id));
  const customValueByFieldId = Object.fromEntries(values.filter((v) => visibleIds.has(v.customFieldId)).map((v) => [v.customFieldId, v.value]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">バージョンを編集</h1>
      <VersionEditForm projectIdentifier={identifier} version={version} customFields={customFields} customValueByFieldId={customValueByFieldId} />
      <div className="border-t pt-4">
        <DeleteVersionButton projectIdentifier={identifier} versionId={version.id} />
      </div>
    </main>
  );
}
