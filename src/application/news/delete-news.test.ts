import { describe, expect, it, mock } from "bun:test";
import { deleteNews } from "./delete-news";
import type { Attachment } from "@/domain/attachment/entity";
import type { AttachmentRepository, AttachmentStorage } from "@/domain/attachment/repository";
import type { NewsRepository } from "@/domain/news/repository";

function attachment(id: string): Attachment {
  return {
    id,
    containerType: "News",
    containerId: "news-1",
    authorId: "u1",
    filename: `${id}.txt`,
    storageKey: `key-${id}`,
    contentType: "text/plain",
    fileSize: 1,
    digest: "d",
    description: "",
    downloads: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

describe("deleteNews", () => {
  it("removes the news attachments and their files before the row", async () => {
    const listByContainer = mock(async () => [attachment("a1"), attachment("a2")]);
    const deleteAttachment = mock<(id: string) => Promise<void>>(async () => {});
    const deleteFile = mock<(key: string) => Promise<void>>(async () => {});
    const deleteRow = mock(async () => {});

    await deleteNews(
      {
        newsRepository: { delete: deleteRow } as unknown as NewsRepository,
        attachmentRepository: { listByContainer, delete: deleteAttachment } as unknown as AttachmentRepository,
        attachmentStorage: { delete: deleteFile } as unknown as AttachmentStorage,
      },
      "news-1",
    );

    expect(listByContainer).toHaveBeenCalledWith("News", "news-1");
    expect(deleteAttachment.mock.calls.map(([id]) => id)).toEqual(["a1", "a2"]);
    expect(deleteFile.mock.calls.map(([key]) => key)).toEqual(["key-a1", "key-a2"]);
    expect(deleteRow).toHaveBeenCalledWith("news-1");
  });
});
