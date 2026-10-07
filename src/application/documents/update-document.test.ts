import { describe, expect, it, mock } from "bun:test";
import { InvalidDocumentError, updateDocument } from "./update-document";
import type { Document } from "@/domain/document/entity";
import type { DocumentRepository } from "@/domain/document/repository";

function makeRepo() {
  const update = mock(async (id: string, changes: Record<string, unknown>) => ({ id, ...changes }) as unknown as Document);
  return { documentRepository: { update } as unknown as DocumentRepository, update };
}

const base = { documentId: "doc-1", categoryId: "cat-1", title: "Spec", description: "d" };

describe("updateDocument", () => {
  it("saves the three safe attributes", async () => {
    const { documentRepository, update } = makeRepo();
    await updateDocument({ documentRepository }, base);
    expect(update).toHaveBeenCalledWith("doc-1", { categoryId: "cat-1", title: "Spec", description: "d" });
  });

  it("rejects an empty title", async () => {
    const { documentRepository } = makeRepo();
    await expect(updateDocument({ documentRepository }, { ...base, title: "   " })).rejects.toThrow(InvalidDocumentError);
  });

  it("rejects a title longer than 255 characters", async () => {
    const { documentRepository } = makeRepo();
    await expect(updateDocument({ documentRepository }, { ...base, title: "a".repeat(256) })).rejects.toThrow(InvalidDocumentError);
  });

  it("rejects a missing category", async () => {
    const { documentRepository } = makeRepo();
    await expect(updateDocument({ documentRepository }, { ...base, categoryId: "" })).rejects.toThrow(InvalidDocumentError);
  });
});
