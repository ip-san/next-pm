import { describe, expect, it, mock } from "bun:test";
import { createNews, InvalidNewsError } from "./create-news";
import type { News } from "@/domain/news/entity";
import type { NewsRepository } from "@/domain/news/repository";

function makeRepo(): NewsRepository {
  return {
    listByProject: mock(async () => []),
    findById: mock(async () => null),
    create: mock(async (news) => ({ ...news, id: "news-1", createdAt: new Date() }) as News),
    delete: mock(async () => {}),
    search: mock(async () => []),
  };
}

const baseInput = { projectId: "proj-1", authorId: "user-1", title: "Release 1.0", summary: "It shipped", description: "Full details here." };

describe("createNews", () => {
  it("creates a news item with valid fields", async () => {
    const newsRepository = makeRepo();
    const item = await createNews({ newsRepository }, baseInput);
    expect(item.title).toBe("Release 1.0");
  });

  it("rejects an empty title", async () => {
    const newsRepository = makeRepo();
    await expect(createNews({ newsRepository }, { ...baseInput, title: "" })).rejects.toThrow(InvalidNewsError);
  });

  it("rejects a title longer than 60 characters", async () => {
    const newsRepository = makeRepo();
    await expect(createNews({ newsRepository }, { ...baseInput, title: "a".repeat(61) })).rejects.toThrow(InvalidNewsError);
  });

  it("rejects a summary longer than 255 characters", async () => {
    const newsRepository = makeRepo();
    await expect(createNews({ newsRepository }, { ...baseInput, summary: "a".repeat(256) })).rejects.toThrow(InvalidNewsError);
  });

  it("rejects an empty description", async () => {
    const newsRepository = makeRepo();
    await expect(createNews({ newsRepository }, { ...baseInput, description: "" })).rejects.toThrow(InvalidNewsError);
  });
});
