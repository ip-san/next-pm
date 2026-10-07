import { describe, expect, it, mock } from "bun:test";
import { WikiPageProtectedError, saveWikiPage } from "./save-wiki-page";
import type { WikiPage, WikiContentVersion } from "@/domain/wiki/entity";
import type { WikiContentRepository, WikiPageRepository } from "@/domain/wiki/repository";

function makeRepos(existingPage: WikiPage | null, existingVersion: WikiContentVersion | null) {
  const wikiPageRepository: WikiPageRepository = {
    listForProject: mock(async () => (existingPage ? [existingPage] : [])),
    findById: mock(async () => existingPage),
    findByTitle: mock(async () => existingPage),
    create: mock(async (p) => ({ ...p, id: "page-1" })),
    rename: mock(async (id, newTitle) => ({ ...(existingPage as WikiPage), id, title: newTitle })),
    setParent: mock(async (id, parentId) => ({ ...(existingPage as WikiPage), id, parentId })),
    setProtected: mock(async (id, isProtected) => ({ ...(existingPage as WikiPage), id, isProtected })),
    delete: mock(async () => {}),
  };
  const wikiContentRepository: WikiContentRepository = {
    findCurrent: mock(async () => existingVersion),
    findVersion: mock(async () => existingVersion),
    listVersions: mock(async () => (existingVersion ? [existingVersion] : [])),
    createVersion: mock(async (v) => ({ ...v, id: "version-1", createdAt: new Date() })),
    search: mock(async () => []),
    listByProject: mock(async () => []),
    listCurrentByProject: mock(async () => []),
  };
  return { wikiPageRepository, wikiContentRepository };
}

const baseInput = {
  projectId: "proj-1",
  title: "Home",
  text: "Hello",
  comments: "",
  authorId: "user-1",
  parentId: undefined,
  canReparentExisting: false,
  canProtect: false,
};

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

  it("refuses to append a version to a protected page without protect_wiki_pages", async () => {
    const existingPage: WikiPage = { id: "page-1", projectId: "proj-1", title: "Home", parentId: null, isProtected: true };
    const repos = makeRepos(existingPage, null);
    await expect(saveWikiPage(repos, baseInput)).rejects.toThrow(WikiPageProtectedError);
    expect(repos.wikiContentRepository.createVersion).not.toHaveBeenCalled();
  });

  it("protects a newly created Sidebar page, mirroring DEFAULT_PROTECTED_PAGES", async () => {
    const repos = makeRepos(null, null);
    const { page } = await saveWikiPage(repos, { ...baseInput, title: "Sidebar" });
    expect(page.isProtected).toBe(true);
  });

  // Redmine's safe_attributes drop parent_id for a caller without rename_wiki_pages, so a
  // hand-rolled POST carrying one must not move the page even though edit_wiki_pages let the
  // save itself through — hiding the select in the form is not a gate.
  it("ignores parentId on an existing page without rename_wiki_pages", async () => {
    const existingPage: WikiPage = { id: "page-1", projectId: "proj-1", title: "Home", parentId: null, isProtected: false };
    const repos = makeRepos(existingPage, null);
    // page-2 is a perfectly valid parent — the permission is the only thing stopping the move.
    repos.wikiPageRepository.listForProject = mock(async () => [
      existingPage,
      { id: "page-2", projectId: "proj-1", title: "Other", parentId: null, isProtected: false },
    ]);
    await saveWikiPage(repos, { ...baseInput, parentId: "page-2", canReparentExisting: false });
    expect(repos.wikiPageRepository.setParent).not.toHaveBeenCalled();
  });

  it("applies parentId on an existing page with rename_wiki_pages", async () => {
    const existingPage: WikiPage = { id: "page-1", projectId: "proj-1", title: "Home", parentId: null, isProtected: false };
    const repos = makeRepos(existingPage, null);
    repos.wikiPageRepository.listForProject = mock(async () => [
      existingPage,
      { id: "page-2", projectId: "proj-1", title: "Other", parentId: null, isProtected: false },
    ]);
    await saveWikiPage(repos, { ...baseInput, parentId: "page-2", canReparentExisting: true });
    expect(repos.wikiPageRepository.setParent).toHaveBeenCalledWith("page-1", "page-2");
  });

  // Regression: the REST PUT body carries no parent, so it must send undefined. Passing null
  // would detach every page it touches from its parent.
  it("leaves an existing page's parent alone when parentId is undefined", async () => {
    const existingPage: WikiPage = { id: "page-1", projectId: "proj-1", title: "Home", parentId: "page-9", isProtected: false };
    const repos = makeRepos(existingPage, null);
    const { page } = await saveWikiPage(repos, { ...baseInput, parentId: undefined, canReparentExisting: true });
    expect(repos.wikiPageRepository.setParent).not.toHaveBeenCalled();
    expect(page.parentId).toBe("page-9");
  });
});
