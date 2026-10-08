import { describe, expect, it, mock } from "bun:test";
import { deleteDocument, type DeleteDocumentRepositories } from "./delete-document";
import type { Attachment } from "@/domain/attachment/entity";

function makeRepositories(attachments: Attachment[]) {
  const deletedRows: string[] = [];
  const deletedFiles: string[] = [];
  const deletedDocuments: string[] = [];

  const repositories: DeleteDocumentRepositories = {
    documentRepository: {
      delete: mock(async (id: string) => {
        deletedDocuments.push(id);
      }),
    } as unknown as DeleteDocumentRepositories["documentRepository"],
    attachmentRepository: {
      listByContainer: mock(async () => attachments),
      delete: mock(async (id: string) => {
        deletedRows.push(id);
      }),
    } as unknown as DeleteDocumentRepositories["attachmentRepository"],
    attachmentStorage: {
      delete: mock(async (key: string) => {
        deletedFiles.push(key);
      }),
    } as unknown as DeleteDocumentRepositories["attachmentStorage"],
  };

  return { repositories, deletedRows, deletedFiles, deletedDocuments };
}

const attachment = (id: string, storageKey: string) => ({ id, storageKey }) as Attachment;

describe("deleteDocument", () => {
  it("removes the attachment rows and their files along with the document", async () => {
    // Regression: attachments address their container polymorphically, so nothing cascaded
    // and both the rows and the files were left behind.
    const { repositories, deletedRows, deletedFiles, deletedDocuments } = makeRepositories([
      attachment("a-1", "key-1"),
      attachment("a-2", "key-2"),
    ]);

    await deleteDocument(repositories, "doc-1");

    expect(deletedRows).toEqual(["a-1", "a-2"]);
    expect(deletedFiles).toEqual(["key-1", "key-2"]);
    expect(deletedDocuments).toEqual(["doc-1"]);
  });

  it("deletes a document with no attachments", async () => {
    const { repositories, deletedDocuments, deletedFiles } = makeRepositories([]);

    await deleteDocument(repositories, "doc-1");

    expect(deletedDocuments).toEqual(["doc-1"]);
    expect(deletedFiles).toEqual([]);
  });

  it("still deletes the document when a stored file is already gone", async () => {
    const { repositories, deletedDocuments } = makeRepositories([attachment("a-1", "key-missing")]);
    repositories.attachmentStorage.delete = mock(async () => {
      throw new Error("ENOENT");
    });

    await deleteDocument(repositories, "doc-1");

    expect(deletedDocuments).toEqual(["doc-1"]);
  });
});
