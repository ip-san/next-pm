import { describe, expect, it } from "bun:test";
import { InvalidWikiParentError, resolveWikiPageParent } from "./set-wiki-page-parent";
import type { WikiPage } from "@/domain/wiki/entity";
import type { WikiPageRepository } from "@/domain/wiki/repository";

const pages: WikiPage[] = [
  { id: "parent", projectId: "proj-1", title: "Parent", parentId: null, isProtected: false },
  { id: "child", projectId: "proj-1", title: "Child", parentId: "parent", isProtected: false },
  { id: "other", projectId: "proj-1", title: "Other", parentId: null, isProtected: false },
  { id: "foreign", projectId: "proj-2", title: "Foreign", parentId: null, isProtected: false },
];

const wikiPageRepository = {
  listForProject: async (projectId: string) => pages.filter((p) => p.projectId === projectId),
  findById: async (id: string) => pages.find((p) => p.id === id) ?? null,
} as unknown as WikiPageRepository;

const parentPage = pages[0];

describe("resolveWikiPageParent", () => {
  it("returns null for no parent without touching the repository", async () => {
    expect(await resolveWikiPageParent(wikiPageRepository, "proj-1", parentPage, null)).toBeNull();
  });

  it("accepts a sibling page in the same project", async () => {
    expect(await resolveWikiPageParent(wikiPageRepository, "proj-1", parentPage, "other")).toBe("other");
  });

  it("rejects a page from another project as :not_same_project does", async () => {
    await expect(resolveWikiPageParent(wikiPageRepository, "proj-1", parentPage, "foreign")).rejects.toMatchObject({
      reason: "cross_project",
    });
  });

  it("rejects an unknown id", async () => {
    await expect(resolveWikiPageParent(wikiPageRepository, "proj-1", parentPage, "nope")).rejects.toThrow(InvalidWikiParentError);
  });

  it("rejects the page's own descendant", async () => {
    await expect(resolveWikiPageParent(wikiPageRepository, "proj-1", parentPage, "child")).rejects.toMatchObject({
      reason: "cycle",
    });
  });

  it("rejects the page itself", async () => {
    await expect(resolveWikiPageParent(wikiPageRepository, "proj-1", parentPage, "parent")).rejects.toMatchObject({
      reason: "cycle",
    });
  });

  it("skips the cycle check for a page that doesn't exist yet", async () => {
    expect(await resolveWikiPageParent(wikiPageRepository, "proj-1", null, "child")).toBe("child");
  });
});
