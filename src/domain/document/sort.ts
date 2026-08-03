import type { Document } from "./entity";

export type DocumentSortBy = "category" | "date" | "title" | "author";

export const DOCUMENT_SORT_OPTIONS: DocumentSortBy[] = ["category", "date", "title", "author"];

export interface DocumentGroup {
  /** category: the categoryId; date: YYYY-MM-DD; title: a single uppercase char; author: the userId. Null only for an uncategorized document. */
  key: string | null;
  documents: Document[];
}

/**
 * Mirrors DocumentsController#index's four sort_by grouping modes (category/date/title/author).
 * Redmine groups by updated_on; Document here has no updatedAt (documents aren't edited after
 * creation the way issues/wiki pages are — see domain/document/entity.ts), so createdAt stands
 * in. "author" mode drops documents with no attachments at all, same as Redmine's
 * `documents.select { |d| d.attachments.any? }` — there's no author to group them by.
 */
export function groupDocuments(
  documents: Document[],
  sortBy: DocumentSortBy,
  lastAttachmentAuthorId: (document: Document) => string | null,
): DocumentGroup[] {
  const source = sortBy === "date" ? [...documents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) : documents;

  const groups = new Map<string | null, Document[]>();
  for (const document of source) {
    let key: string | null;
    switch (sortBy) {
      case "category":
        key = document.categoryId;
        break;
      case "date":
        key = document.createdAt.toISOString().slice(0, 10);
        break;
      case "title":
        key = document.title.charAt(0).toUpperCase() || null;
        break;
      case "author": {
        const authorId = lastAttachmentAuthorId(document);
        if (authorId === null) continue;
        key = authorId;
        break;
      }
    }
    const list = groups.get(key) ?? [];
    list.push(document);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, docs]) => ({ key, documents: docs }));
}
