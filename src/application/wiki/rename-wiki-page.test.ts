import { describe, expect, it } from "bun:test";
import { WikiPageNotFoundError, WikiTitleConflictError, renameWikiPage } from "./rename-wiki-page";
import type { WikiPage, WikiRedirect } from "@/domain/wiki/entity";
import type { WikiPageRepository, WikiRedirectRepository } from "@/domain/wiki/repository";

function makeRepos(pages: WikiPage[], redirects: WikiRedirect[]) {
  const wikiPageRepository: WikiPageRepository = {
    listForProject: async (projectId) => pages.filter((p) => p.projectId === projectId),
    findById: async (id) => pages.find((p) => p.id === id) ?? null,
    findByTitle: async (projectId, title) => pages.find((p) => p.projectId === projectId && p.title === title) ?? null,
    create: async (p) => {
      const created = { ...p, id: `page-${pages.length + 1}` };
      pages.push(created);
      return created;
    },
    rename: async (id, newTitle) => {
      const page = pages.find((p) => p.id === id);
      if (!page) throw new Error("not found");
      page.title = newTitle;
      return page;
    },
  };

  const wikiRedirectRepository: WikiRedirectRepository = {
    findByTitle: async (projectId, title) => redirects.find((r) => r.projectId === projectId && r.title === title) ?? null,
    retarget: async (projectId, oldTarget, newTarget) => {
      for (const redirect of redirects.filter((r) => r.projectId === projectId && r.redirectsToTitle === oldTarget)) {
        if (redirect.title === newTarget) {
          redirects.splice(redirects.indexOf(redirect), 1);
        } else {
          redirect.redirectsToTitle = newTarget;
        }
      }
    },
    deleteByTitle: async (projectId, title) => {
      for (const redirect of redirects.filter((r) => r.projectId === projectId && r.title === title)) {
        redirects.splice(redirects.indexOf(redirect), 1);
      }
    },
    create: async (entry) => {
      const created: WikiRedirect = { ...entry, id: `redirect-${redirects.length + 1}`, createdAt: new Date() };
      redirects.push(created);
      return created;
    },
  };

  return { wikiPageRepository, wikiRedirectRepository, pages, redirects };
}

const page: WikiPage = { id: "page-1", projectId: "proj-1", title: "Old_title", parentId: null, isProtected: false };

describe("renameWikiPage", () => {
  it("renames the page and leaves a redirect from the old title", async () => {
    const repos = makeRepos([{ ...page }], []);
    const renamed = await renameWikiPage(repos, { pageId: "page-1", newTitle: "New_title", keepRedirect: true });

    expect(renamed.title).toBe("New_title");
    expect(repos.redirects).toEqual([
      expect.objectContaining({ projectId: "proj-1", title: "Old_title", redirectsToTitle: "New_title" }),
    ]);
  });

  it("does not create a redirect when keepRedirect is false", async () => {
    const repos = makeRepos([{ ...page }], []);
    await renameWikiPage(repos, { pageId: "page-1", newTitle: "New_title", keepRedirect: false });

    expect(repos.redirects).toEqual([]);
  });

  it("is a no-op when the new title matches the current one", async () => {
    const repos = makeRepos([{ ...page }], []);
    const result = await renameWikiPage(repos, { pageId: "page-1", newTitle: "Old_title", keepRedirect: true });

    expect(result.title).toBe("Old_title");
    expect(repos.redirects).toEqual([]);
  });

  it("throws when the page doesn't exist", async () => {
    const repos = makeRepos([], []);
    await expect(renameWikiPage(repos, { pageId: "missing", newTitle: "New_title", keepRedirect: true })).rejects.toThrow(
      WikiPageNotFoundError,
    );
  });

  it("throws when a page with the new title already exists", async () => {
    const other: WikiPage = { id: "page-2", projectId: "proj-1", title: "New_title", parentId: null, isProtected: false };
    const repos = makeRepos([{ ...page }, other], []);
    await expect(renameWikiPage(repos, { pageId: "page-1", newTitle: "New_title", keepRedirect: true })).rejects.toThrow(
      WikiTitleConflictError,
    );
  });

  it("collapses a redirect chain instead of leaving A->B->C", async () => {
    // A page was already renamed once: A -> B (redirect A->B exists). Now B is renamed to C.
    const existingRedirect: WikiRedirect = {
      id: "redirect-1",
      projectId: "proj-1",
      title: "A",
      redirectsToTitle: "Old_title", // "Old_title" here plays the role of B
      createdAt: new Date(),
    };
    const repos = makeRepos([{ ...page }], [existingRedirect]);
    await renameWikiPage(repos, { pageId: "page-1", newTitle: "New_title", keepRedirect: true });

    const redirectFromA = repos.redirects.find((r) => r.title === "A");
    expect(redirectFromA?.redirectsToTitle).toBe("New_title");
  });

  it("destroys a redirect that would become self-referential after retargeting", async () => {
    // A round-trip rename: page "B" (id page-1) is being renamed back to "A", and a stale
    // redirect A->B already exists from the original A->B rename.
    const roundTripPage: WikiPage = { id: "page-1", projectId: "proj-1", title: "B", parentId: null, isProtected: false };
    const staleRedirect: WikiRedirect = { id: "redirect-1", projectId: "proj-1", title: "A", redirectsToTitle: "B", createdAt: new Date() };
    const repos = makeRepos([roundTripPage], [staleRedirect]);
    await renameWikiPage(repos, { pageId: "page-1", newTitle: "A", keepRedirect: false });

    expect(repos.redirects.find((r) => r.title === "A")).toBeUndefined();
  });

  it("drops a stale redirect that collides with the new title", async () => {
    // A redirect "New_title" -> "Somewhere" exists from an unrelated earlier rename; renaming
    // this page TO "New_title" must remove that stale redirect since the title is now real again.
    const staleRedirect: WikiRedirect = {
      id: "redirect-1",
      projectId: "proj-1",
      title: "New_title",
      redirectsToTitle: "Somewhere",
      createdAt: new Date(),
    };
    const repos = makeRepos([{ ...page }], [staleRedirect]);
    await renameWikiPage(repos, { pageId: "page-1", newTitle: "New_title", keepRedirect: false });

    expect(repos.redirects.find((r) => r.title === "New_title" && r.redirectsToTitle === "Somewhere")).toBeUndefined();
  });
});
