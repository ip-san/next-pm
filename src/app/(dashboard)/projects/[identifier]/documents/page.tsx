import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/domain/authorization/authorization-service";
import { DOCUMENT_SORT_OPTIONS, groupDocuments, type DocumentSortBy } from "@/domain/document/sort";
import { DrizzleAttachmentRepository } from "@/infrastructure/db/repositories/attachment-repository";
import { DrizzleDocumentRepository } from "@/infrastructure/db/repositories/document-repository";
import { DrizzleEnumerationRepository } from "@/infrastructure/db/repositories/enumeration-repository";
import { DrizzleProjectRepository } from "@/infrastructure/db/repositories/project-repository";
import { DrizzleUserRepository } from "@/infrastructure/db/repositories/user-repository";
import { currentUserFromCookies } from "@/interface/http/current-user";
import { resolveActor, toAuthorizationProject } from "@/interface/http/resolve-actor";
import { DocumentCreateForm } from "./document-create-form";

export const dynamic = "force-dynamic";

const SORT_LABEL: Record<DocumentSortBy, string> = {
  category: "カテゴリ",
  date: "日付",
  title: "タイトル",
  author: "投稿者",
};

function parseSortBy(value: string | undefined): DocumentSortBy {
  return value !== undefined && (DOCUMENT_SORT_OPTIONS as string[]).includes(value) ? (value as DocumentSortBy) : "category";
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ identifier: string }>;
  searchParams: Promise<{ sort_by?: string }>;
}) {
  const { identifier } = await params;
  const { sort_by: sortByParam } = await searchParams;
  const sortBy = parseSortBy(sortByParam);

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

  const attachmentRepository = new DrizzleAttachmentRepository();
  const attachmentsByDocumentId = new Map(
    await Promise.all(documents.map(async (document) => [document.id, await attachmentRepository.listByContainer("Document", document.id)] as const)),
  );
  const lastAttachmentAuthorId = (document: (typeof documents)[number]): string | null => {
    const attachments = attachmentsByDocumentId.get(document.id) ?? [];
    return attachments.length > 0 ? attachments[attachments.length - 1].authorId : null;
  };

  const groups = groupDocuments(documents, sortBy, lastAttachmentAuthorId);

  const userIdsNeeded =
    sortBy === "author"
      ? groups.map((group) => group.key).filter((key): key is string => key !== null)
      : [];
  const users = await new DrizzleUserRepository().findByIds(userIdsNeeded);
  const userById = new Map(users.map((u) => [u.id, `${u.lastname} ${u.firstname}`]));

  function groupLabel(key: string | null): string {
    if (sortBy === "category") return key ? (categoryById.get(key)?.name ?? "?") : "-";
    if (sortBy === "author") return key ? (userById.get(key) ?? "?") : "-";
    return key ?? "-";
  }

  return (
    <main className="p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">ドキュメント</h1>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-500">並び替え:</span>
        {DOCUMENT_SORT_OPTIONS.map((option) => (
          <Link
            key={option}
            href={`?sort_by=${option}`}
            className={option === sortBy ? "font-semibold underline" : "underline text-gray-500"}
          >
            {SORT_LABEL[option]}
          </Link>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-gray-400 text-xs">ドキュメントはありません。</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key ?? "__none__"} className="flex flex-col gap-2">
              <h2 className="font-semibold text-sm border-b pb-1">{groupLabel(group.key)}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {group.documents.map((document) => (
                  <li key={document.id} className="border rounded p-3">
                    <Link href={`/projects/${identifier}/documents/${document.id}`} className="font-medium underline">
                      {document.title}
                    </Link>
                    {sortBy !== "category" ? (
                      <p className="text-xs text-gray-500">{categoryById.get(document.categoryId)?.name ?? "?"}</p>
                    ) : null}
                    <p className="text-gray-600">{document.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {canAddDocuments ? <DocumentCreateForm projectIdentifier={identifier} categories={categories} /> : null}
    </main>
  );
}
