import { describe, expect, it, mock } from "bun:test";
import { InvalidReassignTargetError, deleteWikiPage, type DeleteWikiPageRepositories } from "./delete-wiki-page";
import { WikiPageNotFoundError } from "./rename-wiki-page";
import { WikiPageProtectedError } from "./save-wiki-page";
import type { Attachment } from "@/domain/attachment/entity";
import type { WikiPage } from "@/domain/wiki/entity";

// parent
//  ├── child
//  │     └── grandchild
//  └── sibling (not a child of parent — a root page used as the reassign target)
function makePages(): WikiPage[] {
  return [
    { id: "parent", projectId: "proj-1", title: "Parent", parentId: null, isProtected: false },
    { id: "child", projectId: "proj-1", title: "Child", parentId: "parent", isProtected: false },
    { id: "grandchild", projectId: "proj-1", title: "Grandchild", parentId: "child", isProtected: false },
    { id: "sibling", projectId: "proj-1", title: "Sibling", parentId: null, isProtected: false },
  ];
}

function makeRepos(pages: WikiPage[], attachments: Attachment[] = []) {
  const deletedStorageKeys: string[] = [];
  const deletedRedirectTargets: string[] = [];
  const unwatched: string[] = [];

  const repositories = {
    wikiPageRepository: {
      listForProject: async (projectId: string) => pages.filter((p) => p.projectId === projectId),
      findById: async (id: string) => pages.find((p) => p.id === id) ?? null,
      findByTitle: async (projectId: string, title: string) =>
        pages.find((p) => p.projectId === projectId && p.title === title) ?? null,
      create: mock(),
      rename: mock(),
      setParent: async (id: string, parentId: string | null) => {
        const page = pages.find((p) => p.id === id);
        if (!page) throw new Error("not found");
        page.parentId = parentId;
        return page;
      },
      setProtected: mock(),
      delete: async (id: string) => {
        const index = pages.findIndex((p) => p.id === id);
        if (index !== -1) pages.splice(index, 1);
        // The real schema clears children's parent_id via ON DELETE SET NULL.
        for (const page of pages) {
          if (page.parentId === id) page.parentId = null;
        }
      },
    },
    wikiRedirectRepository: {
      findByTitle: mock(),
      retarget: mock(),
      deleteByTitle: mock(),
      deleteAllForProject: async () => {},
      deleteByTarget: async (_projectId: string, title: string) => {
        deletedRedirectTargets.push(title);
      },
      create: mock(),
    },
    attachmentRepository: {
      listByContainer: async (_type: string, containerId: string) => attachments.filter((a) => a.containerId === containerId),
      findById: mock(),
      create: mock(),
      attachToContainer: mock(),
      delete: async (id: string) => {
        const index = attachments.findIndex((a) => a.id === id);
        if (index !== -1) attachments.splice(index, 1);
      },
      listPendingOlderThan: mock(),
    },
    attachmentStorage: {
      save: mock(),
      read: mock(),
      delete: async (key: string) => {
        deletedStorageKeys.push(key);
      },
    },
    watcherRepository: {
      isWatching: mock(),
      watch: mock(),
      unwatch: mock(),
      listWatchedIds: mock(),
      listWatcherUserIds: mock(),
      unwatchAll: async (_type: string, id: string) => {
        unwatched.push(id);
      },
    },
  } as unknown as DeleteWikiPageRepositories;

  return { repositories, pages, attachments, deletedStorageKeys, deletedRedirectTargets, unwatched };
}

const baseInput = { childrenDisposition: "nullify" as const, reassignToId: null, canProtect: false };

describe("deleteWikiPage", () => {
  it("nullify leaves the children behind as root pages", async () => {
    const ctx = makeRepos(makePages());
    await deleteWikiPage(ctx.repositories, { ...baseInput, pageId: "parent" });

    expect(ctx.pages.map((p) => p.id).sort()).toEqual(["child", "grandchild", "sibling"]);
    expect(ctx.pages.find((p) => p.id === "child")?.parentId).toBeNull();
  });

  it("destroy removes the whole subtree, not just the direct children", async () => {
    const ctx = makeRepos(makePages());
    await deleteWikiPage(ctx.repositories, { ...baseInput, pageId: "parent", childrenDisposition: "destroy" });

    expect(ctx.pages.map((p) => p.id)).toEqual(["sibling"]);
  });

  it("reassign hands the direct children to another page and leaves grandchildren in place", async () => {
    const ctx = makeRepos(makePages());
    await deleteWikiPage(ctx.repositories, {
      ...baseInput,
      pageId: "parent",
      childrenDisposition: "reassign",
      reassignToId: "sibling",
    });

    expect(ctx.pages.find((p) => p.id === "child")?.parentId).toBe("sibling");
    expect(ctx.pages.find((p) => p.id === "grandchild")?.parentId).toBe("child");
  });

  it("rejects reassigning the children to the page's own descendant", async () => {
    const ctx = makeRepos(makePages());
    await expect(
      deleteWikiPage(ctx.repositories, {
        ...baseInput,
        pageId: "parent",
        childrenDisposition: "reassign",
        reassignToId: "grandchild",
      }),
    ).rejects.toThrow(InvalidReassignTargetError);
  });

  it("rejects an unknown reassign target", async () => {
    const ctx = makeRepos(makePages());
    await expect(
      deleteWikiPage(ctx.repositories, {
        ...baseInput,
        pageId: "parent",
        childrenDisposition: "reassign",
        reassignToId: "nope",
      }),
    ).rejects.toThrow(InvalidReassignTargetError);
  });

  it("purges the deleted page's attachments, watchers and inbound redirects", async () => {
    const attachment: Attachment = {
      id: "att-1",
      containerType: "WikiPage",
      containerId: "sibling",
      authorId: "user-1",
      filename: "a.png",
      storageKey: "key-1",
      contentType: "image/png",
      fileSize: 1,
      digest: "d", description: "", downloads: 0,
      createdAt: new Date(),
    };
    const ctx = makeRepos(makePages(), [attachment]);
    await deleteWikiPage(ctx.repositories, { ...baseInput, pageId: "sibling" });

    expect(ctx.attachments).toEqual([]);
    expect(ctx.deletedStorageKeys).toEqual(["key-1"]);
    expect(ctx.unwatched).toEqual(["sibling"]);
    expect(ctx.deletedRedirectTargets).toEqual(["Sibling"]);
  });

  it("refuses to delete a protected page without protect_wiki_pages", async () => {
    const pages = makePages();
    pages[3].isProtected = true;
    const ctx = makeRepos(pages);
    await expect(deleteWikiPage(ctx.repositories, { ...baseInput, pageId: "sibling" })).rejects.toThrow(WikiPageProtectedError);
    expect(ctx.pages).toHaveLength(4);
  });

  it("throws when the page doesn't exist", async () => {
    const ctx = makeRepos(makePages());
    await expect(deleteWikiPage(ctx.repositories, { ...baseInput, pageId: "missing" })).rejects.toThrow(WikiPageNotFoundError);
  });
});
