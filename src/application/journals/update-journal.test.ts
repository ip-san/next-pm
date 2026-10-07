import { describe, expect, it, mock } from "bun:test";
import { JournalNotEditableError, updateJournal, type UpdateJournalRepositories } from "./update-journal";
import type { AuthorizationActor } from "@/domain/authorization/authorization-service";
import { makeIssue, makeIssueRepositoryMock } from "@/domain/issue/test-support";
import type { Journal, JournalDetail } from "@/domain/journal/entity";
import type { Project } from "@/domain/project/entity";

const editor: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["edit_issue_notes"], issuesVisibility: "all" }],
};
const ownEditor: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["edit_own_issue_notes"], issuesVisibility: "all" }],
};
const privacyEditor: AuthorizationActor = {
  kind: "member",
  roles: [{ builtin: 0, permissions: ["edit_issue_notes", "set_notes_private"], issuesVisibility: "all" }],
};
const bystander: AuthorizationActor = { kind: "member", roles: [{ builtin: 0, permissions: ["view_issues"], issuesVisibility: "all" }] };

function journal(overrides: Partial<Journal> = {}): Journal {
  return {
    id: "journal-1",
    journalizedType: "Issue",
    journalizedId: "issue-1",
    userId: "author-1",
    notes: "original",
    privateNotes: false,
    details: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    updatedById: null,
    ...overrides,
  };
}

function makeRepositories(stored: Journal | null) {
  const updates: { id: string; changes: Record<string, unknown> }[] = [];
  const deletes: string[] = [];

  const repositories: UpdateJournalRepositories = {
    journalRepository: {
      findById: mock(async () => stored),
      listForIssue: mock(async () => []),
      listByProject: mock(async () => []),
      create: mock(async () => {
        throw new Error("not used");
      }),
      update: mock(async (id: string, changes) => {
        updates.push({ id, changes: changes as Record<string, unknown> });
        return { ...stored!, ...changes } as Journal;
      }),
      delete: mock(async (id: string) => {
        deletes.push(id);
      }),
    },
    issueRepository: makeIssueRepositoryMock({
      findById: mock(async () => makeIssue({ id: "issue-1", projectId: "proj-1" })),
    }),
    projectRepository: {
      findById: mock(async (id: string) => ({ id, status: "active", isPublic: true, enabledModules: ["issue_tracking"] }) as unknown as Project),
    } as unknown as UpdateJournalRepositories["projectRepository"],
  };

  return { repositories, updates, deletes };
}

const viewer = { userId: "editor-1", canViewPrivateNotes: true };

describe("updateJournal", () => {
  it("edits the note for a user with edit_issue_notes", async () => {
    const { repositories, updates } = makeRepositories(journal());

    const result = await updateJournal(repositories, {
      journalId: "journal-1",
      notes: "revised",
      privateNotes: false,
      actingUserId: "editor-1",
      actor: editor,
      viewer,
    });

    expect(result).toMatchObject({ deleted: false });
    expect(updates[0].changes).toMatchObject({ notes: "revised", updatedById: "editor-1" });
  });

  it("refuses a user with neither edit permission", async () => {
    const { repositories, updates } = makeRepositories(journal());

    await expect(
      updateJournal(repositories, {
        journalId: "journal-1",
        notes: "revised",
        privateNotes: false,
        actingUserId: "editor-1",
        actor: bystander,
        viewer,
      }),
    ).rejects.toThrow(JournalNotEditableError);
    expect(updates).toEqual([]);
  });

  it("lets the note's own author edit it under edit_own_issue_notes", async () => {
    const { repositories, updates } = makeRepositories(journal({ userId: "author-1" }));

    await updateJournal(repositories, {
      journalId: "journal-1",
      notes: "revised",
      privateNotes: false,
      actingUserId: "author-1",
      actor: ownEditor,
      viewer: { userId: "author-1", canViewPrivateNotes: false },
    });

    expect(updates).toHaveLength(1);
  });

  it("refuses edit_own_issue_notes on someone else's note", async () => {
    const { repositories } = makeRepositories(journal({ userId: "someone-else" }));

    await expect(
      updateJournal(repositories, {
        journalId: "journal-1",
        notes: "revised",
        privateNotes: false,
        actingUserId: "author-1",
        actor: ownEditor,
        viewer: { userId: "author-1", canViewPrivateNotes: false },
      }),
    ).rejects.toThrow(JournalNotEditableError);
  });

  it("refuses to edit a private note the actor cannot read, even with edit_issue_notes", async () => {
    // Redmine loads the journal through Journal.visible, so an unreadable note is also
    // uneditable — and it reports as missing rather than forbidden.
    const { repositories } = makeRepositories(journal({ privateNotes: true, userId: "someone-else" }));

    await expect(
      updateJournal(repositories, {
        journalId: "journal-1",
        notes: "revised",
        privateNotes: true,
        actingUserId: "editor-1",
        actor: editor,
        viewer: { userId: "editor-1", canViewPrivateNotes: false },
      }),
    ).rejects.toThrow(JournalNotEditableError);
  });

  it("keeps the existing private flag when the actor lacks set_notes_private", async () => {
    const { repositories, updates } = makeRepositories(journal({ privateNotes: true }));

    await updateJournal(repositories, {
      journalId: "journal-1",
      notes: "revised",
      privateNotes: false,
      actingUserId: "editor-1",
      actor: editor,
      viewer,
    });

    expect(updates[0].changes.privateNotes).toBe(true);
  });

  it("changes the private flag with set_notes_private", async () => {
    const { repositories, updates } = makeRepositories(journal({ privateNotes: false }));

    await updateJournal(repositories, {
      journalId: "journal-1",
      notes: "revised",
      privateNotes: true,
      actingUserId: "editor-1",
      actor: privacyEditor,
      viewer,
    });

    expect(updates[0].changes.privateNotes).toBe(true);
  });

  it("deletes a journal whose notes are cleared and which has no details", async () => {
    const { repositories, deletes } = makeRepositories(journal({ notes: "original", details: [] }));

    const result = await updateJournal(repositories, {
      journalId: "journal-1",
      notes: "   ",
      privateNotes: false,
      actingUserId: "editor-1",
      actor: editor,
      viewer,
    });

    expect(result).toEqual({ deleted: true, issueId: "issue-1" });
    expect(deletes).toEqual(["journal-1"]);
  });

  it("keeps a journal whose notes are cleared but which still records changes", async () => {
    const details: JournalDetail[] = [{ property: "attr", fieldName: "statusId", oldValue: "a", newValue: "b" }];
    const { repositories, updates, deletes } = makeRepositories(journal({ details }));

    await updateJournal(repositories, {
      journalId: "journal-1",
      notes: "",
      privateNotes: false,
      actingUserId: "editor-1",
      actor: editor,
      viewer,
    });

    expect(deletes).toEqual([]);
    expect(updates[0].changes).toMatchObject({ notes: "", privateNotes: false });
  });

  it("drops the private flag when the note is blanked but details remain", async () => {
    const details: JournalDetail[] = [{ property: "attr", fieldName: "statusId", oldValue: "a", newValue: "b" }];
    const { repositories, updates } = makeRepositories(journal({ details, privateNotes: true }));

    await updateJournal(repositories, {
      journalId: "journal-1",
      notes: "",
      privateNotes: true,
      actingUserId: "editor-1",
      actor: privacyEditor,
      viewer,
    });

    expect(updates[0].changes.privateNotes).toBe(false);
  });
});
