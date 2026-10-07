import { describe, expect, it, mock } from "bun:test";
import { InvalidNewsError, updateNews } from "./update-news";
import type { News } from "@/domain/news/entity";
import type { NewsRepository } from "@/domain/news/repository";

function makeRepo() {
  const update = mock(async (id: string, changes: Record<string, unknown>) => ({ id, ...changes }) as unknown as News);
  return { newsRepository: { update } as unknown as NewsRepository, update };
}

const base = { newsId: "news-1", title: "Release 1.0", summary: "s", description: "d" };

describe("updateNews", () => {
  it("saves the three safe attributes", async () => {
    const { newsRepository, update } = makeRepo();
    await updateNews({ newsRepository }, base);
    expect(update).toHaveBeenCalledWith("news-1", { title: "Release 1.0", summary: "s", description: "d" });
  });

  it("rejects a title longer than 60 characters", async () => {
    const { newsRepository } = makeRepo();
    await expect(updateNews({ newsRepository }, { ...base, title: "a".repeat(61) })).rejects.toThrow(InvalidNewsError);
  });

  it("rejects a summary longer than 255 characters", async () => {
    const { newsRepository } = makeRepo();
    await expect(updateNews({ newsRepository }, { ...base, summary: "a".repeat(256) })).rejects.toThrow(InvalidNewsError);
  });

  it("rejects an empty description", async () => {
    const { newsRepository } = makeRepo();
    await expect(updateNews({ newsRepository }, { ...base, description: "  " })).rejects.toThrow(InvalidNewsError);
  });
});
