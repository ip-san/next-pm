import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { DocumentCreateForm } from "./document-create-form";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;

  const project = await new DrizzleProjectRepository().findByIdentifier(identifier);
  if (!project) {
    notFound();
  }

  const user = await currentUserFromCookies();
  const { actor } = await resolveActor(user, project.id);
  if (!can({ permission: "view_documents", project: toAuthorizationProject(project), actor })) {
    notFound();
  }
  const canAddDocuments = can({ permission: "add_documents", project: toAuthorizationProject(project), actor });

  const [documents, categories] = await Promise.all([
    new DrizzleDocumentRepository().listByProject(project.id),
    new DrizzleEnumerationRepository().listByType("DocumentCategory"),
  ]);
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">ドキュメント</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {documents.map((document) => (
          <li key={document.id} className="border rounded p-3">
            <Link href={`/projects/${identifier}/documents/${document.id}`} className="font-medium underline">
              {document.title}
            </Link>
            <p className="text-xs text-gray-500">{categoryById.get(document.categoryId)?.name ?? "?"}</p>
            <p className="text-gray-600">{document.description}</p>
          </li>
        ))}
        {documents.length === 0 ? <li className="text-gray-400 text-xs">ドキュメントはありません。</li> : null}
      </ul>
      {canAddDocuments ? <DocumentCreateForm projectIdentifier={identifier} categories={categories} /> : null}
    </main>
  );
}
