import { describe, expect, it } from "bun:test";
import { resolveWikiPage } from "./resolve-wiki-page";
import type { WikiPage, WikiRedirect } from "@/domain/wiki/entity";
import type { WikiPageRepository, WikiRedirectRepository } from "@/domain/wiki/repository";

function makeRepos(pages: WikiPage[], redirects: WikiRedirect[]) {
  const wikiPageRepository: WikiPageRepository = {
    listForProject: async (projectId) => pages.filter((p) => p.projectId === projectId),
    findById: async (id) => pages.find((p) => p.id === id) ?? null,
    findByTitle: async (projectId, title) => pages.find((p) => p.projectId === projectId && p.title === title) ?? null,
    create: async (p) => ({ ...p, id: "new-page" }),
    rename: async (id, newTitle) => ({ ...(pages.find((p) => p.id === id) as WikiPage), title: newTitle }),
  };
  const wikiRedirectRepository: WikiRedirectRepository = {
    findByTitle: async (projectId, title) => redirects.find((r) => r.projectId === projectId && r.title === title) ?? null,
    retarget: async () => {},
    deleteByTitle: async () => {},
    create: async (entry) => ({ ...entry, id: "redirect-1", createdAt: new Date() }),
  };
  return { wikiPageRepository, wikiRedirectRepository };
}

const target: WikiPage = { id: "page-1", projectId: "proj-1", title: "New_title", parentId: null, isProtected: false };

describe("resolveWikiPage", () => {
  it("returns the page directly when the title matches a real page", async () => {
    const repos = makeRepos([target], []);
    const result = await resolveWikiPage(repos, "proj-1", "New_title");
    expect(result).toEqual({ page: target, redirected: false });
  });

  it("follows a redirect when the title is stale", async () => {
    const redirect: WikiRedirect = { id: "r1", projectId: "proj-1", title: "Old_title", redirectsToTitle: "New_title", createdAt: new Date() };
    const repos = makeRepos([target], [redirect]);
    const result = await resolveWikiPage(repos, "proj-1", "Old_title");
    expect(result).toEqual({ page: target, redirected: true });
  });

  it("returns null when neither a page nor a redirect exists for the title", async () => {
    const repos = makeRepos([], []);
    const result = await resolveWikiPage(repos, "proj-1", "Nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when a redirect exists but its target page is gone", async () => {
    const redirect: WikiRedirect = { id: "r1", projectId: "proj-1", title: "Old_title", redirectsToTitle: "Missing_target", createdAt: new Date() };
    const repos = makeRepos([], [redirect]);
    const result = await resolveWikiPage(repos, "proj-1", "Old_title");
    expect(result).toBeNull();
  });
});
