import { FormattedText } from "@/interface/components/formatted-text";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { AttachmentList } from "../../../attachment-list";
import { DeleteDocumentAttachmentButton } from "./delete-document-attachment-button";
import { DeleteDocumentButton } from "./delete-document-button";
import { DocumentEditForm } from "./document-edit-form";
import { DocumentAttachmentUploadForm } from "./document-attachment-upload-form";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ identifier: string; documentId: string }> }) {
  const { identifier, documentId } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_documents", project: toAuthorizationProject(project), actor })) {
    notFound();
  }
  const canEditDocuments = can({ permission: "edit_documents", project: toAuthorizationProject(project), actor });
  const canDeleteDocuments = can({ permission: "delete_documents", project: toAuthorizationProject(project), actor });
  // preparation.rb lists documents#add_attachment under add_documents as well as edit_documents.
  const canAttach = canEditDocuments || can({ permission: "add_documents", project: toAuthorizationProject(project), actor });

  const document = await new DrizzleDocumentRepository().findById(documentId);
  if (!document || document.projectId !== project.id) {
    notFound();
  }

  const [categories, attachments] = await Promise.all([
    new DrizzleEnumerationRepository().listByType("DocumentCategory"),
    new DrizzleAttachmentRepository().listByContainer("Document", document.id),
  ]);
  const category = categories.find((c) => c.id === document.categoryId) ?? null;

  return (
    <main className="p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{document.title}</h1>
        <p className="text-sm text-gray-500">{category?.name ?? "?"}</p>
      </div>

      <FormattedText project={project} text={document.description} />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">添付ファイル</h2>
        <AttachmentList
          attachments={attachments}
          renderAction={
            canDeleteDocuments
              ? (attachment) => <DeleteDocumentAttachmentButton projectIdentifier={identifier} attachmentId={attachment.id} />
              : undefined
          }
        />
        {canAttach ? <DocumentAttachmentUploadForm documentId={document.id} projectIdentifier={identifier} /> : null}
      </section>

      {canEditDocuments || canDeleteDocuments ? (
        <div className="border-t pt-4 flex gap-3 items-start">
          {canEditDocuments ? (
            <DocumentEditForm
              projectIdentifier={identifier}
              documentId={document.id}
              categoryId={document.categoryId}
              title={document.title}
              description={document.description}
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            />
          ) : null}
          {canDeleteDocuments ? <DeleteDocumentButton projectIdentifier={identifier} documentId={document.id} /> : null}
        </div>
      ) : null}
    </main>
  );
}
