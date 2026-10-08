import { describe, expect, it, mock } from "bun:test";
import { deleteProjectWiki, type DeleteProjectWikiRepositories } from "./delete-project-wiki";
import type { Attachment } from "@/domain/attachment/entity";
import type { Wiki, WikiPage, WikiRedirect } from "@/domain/wiki/entity";

function makeRepos() {
  const pages: WikiPage[] = [
    { id: "home", projectId: "proj-1", title: "Home", parentId: null, isProtected: false },
    { id: "child", projectId: "proj-1", title: "Child", parentId: "home", isProtected: true },
    { id: "other", projectId: "proj-2", title: "Elsewhere", parentId: null, isProtected: false },
  ];
  const redirects: WikiRedirect[] = [
    // Points at a page being deleted — purgeWikiPage would catch this one on its own.
    { id: "r1", projectId: "proj-1", title: "Old_home", redirectsToTitle: "Home", createdAt: new Date() },
    // Dangling: its target is already gone, so only Wiki#delete_redirects clears it.
    { id: "r2", projectId: "proj-1", title: "Stale", redirectsToTitle: "Vanished", createdAt: new Date() },
    { id: "r3", projectId: "proj-2", title: "Keep", redirectsToTitle: "Elsewhere", createdAt: new Date() },
  ];
  const attachments: Attachment[] = [
    {
      id: "att-1",
      containerType: "WikiPage",
      containerId: "child",
      authorId: "user-1",
      filename: "a.png",
      storageKey: "key-1",
      contentType: "image/png",
      fileSize: 1,
      digest: "d", description: "", downloads: 0,
      createdAt: new Date(),
    },
  ];
  let wiki: Wiki | null = { id: "wiki-1", projectId: "proj-1", startPage: "Home" };
  const deletedStorageKeys: string[] = [];
  const unwatched: string[] = [];

  const repositories = {
    wikiPageRepository: {
      listForProject: async (projectId: string) => pages.filter((p) => p.projectId === projectId),
      findById: async (id: string) => pages.find((p) => p.id === id) ?? null,
      delete: async (id: string) => {
        const index = pages.findIndex((p) => p.id === id);
        if (index !== -1) pages.splice(index, 1);
      },
      findByTitle: mock(),
      create: mock(),
      rename: mock(),
      setParent: mock(),
      setProtected: mock(),
    },
    wikiRedirectRepository: {
      deleteByTarget: async (projectId: string, title: string) => {
        for (const r of redirects.filter((x) => x.projectId === projectId && x.redirectsToTitle === title)) {
          redirects.splice(redirects.indexOf(r), 1);
        }
      },
      deleteAllForProject: async (projectId: string) => {
        for (const r of redirects.filter((x) => x.projectId === projectId)) {
          redirects.splice(redirects.indexOf(r), 1);
        }
      },
      findByTitle: mock(),
      retarget: mock(),
      deleteByTitle: mock(),
      create: mock(),
    },
    attachmentRepository: {
      listByContainer: async (_t: string, containerId: string) => attachments.filter((a) => a.containerId === containerId),
      delete: async (id: string) => {
        const index = attachments.findIndex((a) => a.id === id);
        if (index !== -1) attachments.splice(index, 1);
      },
      findById: mock(),
      create: mock(),
      attachToContainer: mock(),
      listPendingOlderThan: mock(),
    },
    attachmentStorage: {
      delete: async (key: string) => {
        deletedStorageKeys.push(key);
      },
      save: mock(),
      read: mock(),
    },
    watcherRepository: {
      unwatchAll: async (_t: string, id: string) => {
        unwatched.push(id);
      },
      isWatching: mock(),
      watch: mock(),
      unwatch: mock(),
      listWatchedIds: mock(),
      listWatcherUserIds: mock(),
    },
    wikiRepository: {
      findByProject: async () => wiki,
      setStartPage: async (projectId: string, startPage: string) => {
        wiki = { id: "wiki-1", projectId, startPage };
        return wiki;
      },
    },
  } as unknown as DeleteProjectWikiRepositories;

  return { repositories, pages, redirects, attachments, deletedStorageKeys, unwatched, wiki: () => wiki };
}

describe("deleteProjectWiki", () => {
  it("removes every page of the project and leaves other projects alone", async () => {
    const ctx = makeRepos();
    await deleteProjectWiki(ctx.repositories, "proj-1");
    expect(ctx.pages.map((p) => p.id)).toEqual(["other"]);
  });

  // Page protection is not consulted: WikisController#destroy is gated on manage_wiki alone
  // and never calls editable?, since the wiki record is destroyed rather than edited.
  it("removes a protected page too", async () => {
    const ctx = makeRepos();
    await deleteProjectWiki(ctx.repositories, "proj-1");
    expect(ctx.pages.find((p) => p.id === "child")).toBeUndefined();
  });

  it("clears dangling redirects, not just the ones pointing at deleted pages", async () => {
    const ctx = makeRepos();
    await deleteProjectWiki(ctx.repositories, "proj-1");
    expect(ctx.redirects.map((r) => r.id)).toEqual(["r3"]);
  });

  it("purges attachments and watchers of the deleted pages", async () => {
    const ctx = makeRepos();
    await deleteProjectWiki(ctx.repositories, "proj-1");
    expect(ctx.attachments).toEqual([]);
    expect(ctx.deletedStorageKeys).toEqual(["key-1"]);
    expect(ctx.unwatched.sort()).toEqual(["child", "home"]);
  });

  it("resets the start page, standing in for Wiki.create_default", async () => {
    const ctx = makeRepos();
    await deleteProjectWiki(ctx.repositories, "proj-1");
    expect(ctx.wiki()?.startPage).toBe("Wiki");
  });
});
