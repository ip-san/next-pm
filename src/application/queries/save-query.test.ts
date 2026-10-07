import { describe, expect, it, mock } from "bun:test";
import type { SavedQuery } from "@/domain/query/entity";
import type { QueryRepository, SavedQueryDraft, SavedQueryUpdate } from "@/domain/query/repository";
import { copyQuery } from "./copy-query";
import { deleteQuery } from "./delete-query";
import { InvalidQueryError, QueryPermissionError, type QueryActor, type QuerySettings } from "./query-settings";
import { saveQuery } from "./save-query";
import { QueryNotFoundError, updateQuery } from "./update-query";

const PROJECT_ID = "project-1";

function actor(overrides: Partial<QueryActor> = {}): QueryActor {
  return { userId: "user-1", isAdmin: false, canSaveQueries: true, canManagePublicQueries: false, ...overrides };
}

function settings(overrides: Partial<QuerySettings> = {}): QuerySettings {
  return {
    name: "My query",
    visibility: "private",
    roleIds: [],
    filters: [{ field: "status_id", operator: "o", values: [] }],
    columnNames: ["status", "subject"],
    groupBy: "status",
    sortCriteria: [["subject", "asc"]],
    totalableNames: ["estimated_hours"],
    ...overrides,
  };
}

function savedQuery(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id: "query-1",
    name: "My query",
    type: "IssueQuery",
    projectId: PROJECT_ID,
    userId: "user-1",
    visibility: "private",
    filters: [],
    columnNames: [],
    groupBy: null,
    sortCriteria: [],
    totalableNames: [],
    roleIds: [],
    ...overrides,
  };
}

function repository(stored: SavedQuery | null = null) {
  const created: SavedQueryDraft[] = [];
  const updated: { id: string; changes: SavedQueryUpdate }[] = [];
  const deleted: string[] = [];
  const queryRepository: QueryRepository = {
    listAvailableFor: mock(async () => []),
    findById: mock(async () => stored),
    create: mock(async (draft: SavedQueryDraft) => {
      created.push(draft);
      return { ...draft, id: "new-query" };
    }),
    update: mock(async (id: string, changes: SavedQueryUpdate) => {
      updated.push({ id, changes });
      return { ...savedQuery(), ...changes, id, userId: "user-1", type: "IssueQuery" as const };
    }),
    delete: mock(async (id: string) => {
      deleted.push(id);
    }),
  };
  return { queryRepository, created, updated, deleted };
}

describe("saveQuery", () => {
  it("stores every display setting alongside the filters", async () => {
    const repo = repository();
    await saveQuery(repo, { projectId: PROJECT_ID, type: "IssueQuery", settings: settings(), actor: actor() });

    expect(repo.created[0]).toMatchObject({
      name: "My query",
      type: "IssueQuery",
      projectId: PROJECT_ID,
      userId: "user-1",
      columnNames: ["status", "subject"],
      groupBy: "status",
      sortCriteria: [["subject", "asc"]],
      totalableNames: ["estimated_hours"],
    });
  });

  it("refuses a caller without save_queries", async () => {
    const repo = repository();
    await expect(
      saveQuery(repo, { projectId: PROJECT_ID, type: "IssueQuery", settings: settings(), actor: actor({ canSaveQueries: false }) }),
    ).rejects.toBeInstanceOf(QueryPermissionError);
  });

  it("lets an admin save even without the permission", async () => {
    const repo = repository();
    await saveQuery(repo, {
      projectId: PROJECT_ID,
      type: "IssueQuery",
      settings: settings(),
      actor: actor({ canSaveQueries: false, isAdmin: true }),
    });
    expect(repo.created).toHaveLength(1);
  });

  // Redmine's QueriesController#update_query_from_params forces the visibility back rather
  // than erroring, so a user without manage_public_queries still gets their query saved.
  it("downgrades a public query to private when the caller lacks manage_public_queries", async () => {
    const repo = repository();
    await saveQuery(repo, {
      projectId: PROJECT_ID,
      type: "IssueQuery",
      settings: settings({ visibility: "public" }),
      actor: actor(),
    });
    expect(repo.created[0].visibility).toBe("private");
  });

  it("keeps a public query public when the caller may manage public queries", async () => {
    const repo = repository();
    await saveQuery(repo, {
      projectId: PROJECT_ID,
      type: "IssueQuery",
      settings: settings({ visibility: "public" }),
      actor: actor({ canManagePublicQueries: true }),
    });
    expect(repo.created[0].visibility).toBe("public");
  });

  // allowed_to?(:manage_public_queries, nil) is false for a non-admin, which is what stops
  // a member from owning a global public query (and keeps editable_by? consistent).
  it("forces a global query to private for a non-admin even with manage_public_queries", async () => {
    const repo = repository();
    await saveQuery(repo, {
      projectId: null,
      type: "IssueQuery",
      settings: settings({ visibility: "public" }),
      actor: actor({ canManagePublicQueries: true }),
    });
    expect(repo.created[0].visibility).toBe("private");
  });

  it("rejects a roles-scoped query with no roles", async () => {
    const repo = repository();
    await expect(
      saveQuery(repo, {
        projectId: PROJECT_ID,
        type: "IssueQuery",
        settings: settings({ visibility: "roles", roleIds: [] }),
        actor: actor({ canManagePublicQueries: true }),
      }),
    ).rejects.toBeInstanceOf(InvalidQueryError);
  });

  it("drops role ids when the visibility isn't roles", async () => {
    const repo = repository();
    await saveQuery(repo, {
      projectId: PROJECT_ID,
      type: "IssueQuery",
      settings: settings({ visibility: "public", roleIds: ["role-1"] }),
      actor: actor({ canManagePublicQueries: true }),
    });
    expect(repo.created[0].roleIds).toEqual([]);
  });

  it("rejects a blank name", async () => {
    const repo = repository();
    await expect(
      saveQuery(repo, { projectId: PROJECT_ID, type: "IssueQuery", settings: settings({ name: "   " }), actor: actor() }),
    ).rejects.toBeInstanceOf(InvalidQueryError);
  });

  it("caps the sort criteria at Redmine's three keys", async () => {
    const repo = repository();
    await saveQuery(repo, {
      projectId: PROJECT_ID,
      type: "IssueQuery",
      settings: settings({
        sortCriteria: [
          ["a", "asc"],
          ["b", "desc"],
          ["c", "asc"],
          ["d", "desc"],
        ],
      }),
      actor: actor(),
    });
    expect(repo.created[0].sortCriteria).toEqual([
      ["a", "asc"],
      ["b", "desc"],
      ["c", "asc"],
    ]);
  });
});

describe("updateQuery", () => {
  it("lets the owner edit their own private query", async () => {
    const repo = repository(savedQuery());
    await updateQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, settings: settings({ name: "Renamed" }), actor: actor() });
    expect(repo.updated[0].changes.name).toBe("Renamed");
  });

  // Redmine's find_query runs no save_queries check — only editable_by?.
  it("still lets the owner edit after save_queries is taken away", async () => {
    const repo = repository(savedQuery());
    await updateQuery(repo, {
      queryId: "query-1",
      projectId: PROJECT_ID,
      settings: settings(),
      actor: actor({ canSaveQueries: false }),
    });
    expect(repo.updated).toHaveLength(1);
  });

  it("refuses someone else's private query", async () => {
    const repo = repository(savedQuery({ userId: "other-user" }));
    await expect(
      updateQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, settings: settings(), actor: actor() }),
    ).rejects.toBeInstanceOf(QueryPermissionError);
  });

  it("refuses a public query without manage_public_queries, even for its owner", async () => {
    const repo = repository(savedQuery({ visibility: "public" }));
    await expect(
      updateQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, settings: settings(), actor: actor() }),
    ).rejects.toBeInstanceOf(QueryPermissionError);
  });

  it("allows a public query with manage_public_queries", async () => {
    const repo = repository(savedQuery({ visibility: "public", userId: "other-user" }));
    await updateQuery(repo, {
      queryId: "query-1",
      projectId: PROJECT_ID,
      settings: settings(),
      actor: actor({ canManagePublicQueries: true }),
    });
    expect(repo.updated).toHaveLength(1);
  });

  it("refuses a query belonging to another project (IDOR guard)", async () => {
    const repo = repository(savedQuery({ projectId: "other-project" }));
    await expect(
      updateQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, settings: settings(), actor: actor() }),
    ).rejects.toBeInstanceOf(QueryNotFoundError);
  });
});

describe("deleteQuery", () => {
  it("deletes a query its owner may edit", async () => {
    const repo = repository(savedQuery());
    await deleteQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, actor: actor() });
    expect(repo.deleted).toEqual(["query-1"]);
  });

  it("refuses a query the actor may not edit", async () => {
    const repo = repository(savedQuery({ userId: "other-user" }));
    await expect(deleteQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, actor: actor() })).rejects.toBeInstanceOf(
      QueryPermissionError,
    );
  });
});

describe("copyQuery", () => {
  it("copies a visible query under the actor's own ownership", async () => {
    const repo = repository(savedQuery({ visibility: "public", userId: "other-user", columnNames: ["subject"], groupBy: "tracker" }));
    await copyQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, name: "My copy", actor: actor(), actorRoleIds: [] });

    expect(repo.created[0]).toMatchObject({
      name: "My copy",
      userId: "user-1",
      columnNames: ["subject"],
      groupBy: "tracker",
    });
  });

  // Copying must not be a way around manage_public_queries.
  it("downgrades the copy to private when the actor may not publish", async () => {
    const repo = repository(savedQuery({ visibility: "public", userId: "other-user" }));
    await copyQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, name: "My copy", actor: actor(), actorRoleIds: [] });
    expect(repo.created[0].visibility).toBe("private");
  });

  it("refuses to copy a query the actor cannot see", async () => {
    const repo = repository(savedQuery({ visibility: "private", userId: "other-user" }));
    await expect(
      copyQuery(repo, { queryId: "query-1", projectId: PROJECT_ID, name: "My copy", actor: actor(), actorRoleIds: [] }),
    ).rejects.toBeInstanceOf(QueryNotFoundError);
  });

  it("refuses a caller without save_queries", async () => {
    const repo = repository(savedQuery({ visibility: "public" }));
    await expect(
      copyQuery(repo, {
        queryId: "query-1",
        projectId: PROJECT_ID,
        name: "My copy",
        actor: actor({ canSaveQueries: false }),
        actorRoleIds: [],
      }),
    ).rejects.toBeInstanceOf(QueryPermissionError);
  });
});
