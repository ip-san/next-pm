import { describe, expect, it, mock } from "bun:test";
import { saveWikiPage } from "./save-wiki-page";
import type { WikiPage, WikiContentVersion } from "@/domain/wiki/entity";
import type { WikiContentRepository, WikiPageRepository } from "@/domain/wiki/repository";

function makeRepos(existingPage: WikiPage | null, existingVersion: WikiContentVersion | null) {
  const wikiPageRepository: WikiPageRepository = {
    listForProject: mock(async () => (existingPage ? [existingPage] : [])),
    findById: mock(async () => existingPage),
    findByTitle: mock(async () => existingPage),
    create: mock(async (p) => ({ ...p, id: "page-1" })),
    rename: mock(async (id, newTitle) => ({ ...(existingPage as WikiPage), id, title: newTitle })),
  };
  const wikiContentRepository: WikiContentRepository = {
    findCurrent: mock(async () => existingVersion),
    findVersion: mock(async () => existingVersion),
    listVersions: mock(async () => (existingVersion ? [existingVersion] : [])),
    createVersion: mock(async (v) => ({ ...v, id: "version-1", createdAt: new Date() })),
    search: mock(async () => []),
    listByProject: mock(async () => []),
  };
  return { wikiPageRepository, wikiContentRepository };
}

const baseInput = { projectId: "proj-1", title: "Home", text: "Hello", comments: "", authorId: "user-1", parentId: null };

describe("saveWikiPage", () => {
  it("creates a new page at version 1 when the title doesn't exist yet", async () => {
    const repos = makeRepos(null, null);
    const { page, version } = await saveWikiPage(repos, baseInput);
    expect(repos.wikiPageRepository.create).toHaveBeenCalled();
    expect(page.title).toBe("Home");
    expect(version.version).toBe(1);
  });

  it("appends version 2 to an existing page without creating a new page row", async () => {
    const existingPage: WikiPage = { id: "page-1", projectId: "proj-1", title: "Home", parentId: null, isProtected: false };
    const existingVersion: WikiContentVersion = {
      id: "v1",
      pageId: "page-1",
      version: 1,
      authorId: "user-1",
      text: "Old text",
      comments: "",
      createdAt: new Date(),
    };
    const repos = makeRepos(existingPage, existingVersion);
    const { page, version } = await saveWikiPage(repos, { ...baseInput, text: "New text" });
    expect(repos.wikiPageRepository.create).not.toHaveBeenCalled();
    expect(page.id).toBe("page-1");
    expect(version.version).toBe(2);
    expect(version.text).toBe("New text");
  });
});
