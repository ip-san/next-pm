import { describe, expect, it, mock } from "bun:test";
import { createDocument, InvalidDocumentError } from "./create-document";
import type { Document } from "@/domain/document/entity";
import type { DocumentRepository } from "@/domain/document/repository";

function makeRepo(): DocumentRepository {
  return {
    listByProject: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async (document) => ({ ...document, id: "doc-1", createdAt: new Date() }) as Document),
    delete: mock(async () => {}),
  };
}

const baseInput = { projectId: "proj-1", categoryId: "cat-1", title: "Spec sheet", description: "Details" };

describe("createDocument", () => {
  it("creates a document with valid fields", async () => {
    const documentRepository = makeRepo();
    const document = await createDocument({ documentRepository }, baseInput);
    expect(document.title).toBe("Spec sheet");
  });

  it("rejects an empty title", async () => {
    const documentRepository = makeRepo();
    await expect(createDocument({ documentRepository }, { ...baseInput, title: "" })).rejects.toThrow(InvalidDocumentError);
  });

  it("rejects a title longer than 255 characters", async () => {
    const documentRepository = makeRepo();
    await expect(createDocument({ documentRepository }, { ...baseInput, title: "a".repeat(256) })).rejects.toThrow(InvalidDocumentError);
  });

  it("rejects a missing category", async () => {
    const documentRepository = makeRepo();
    await expect(createDocument({ documentRepository }, { ...baseInput, categoryId: "" })).rejects.toThrow(InvalidDocumentError);
  });
});
