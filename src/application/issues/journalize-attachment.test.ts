import { describe, expect, it, mock } from "bun:test";
import { journalizeAttachment } from "./journalize-attachment";
import type { Journal } from "@/domain/journal/entity";
import type { JournalRepository } from "@/domain/journal/repository";

function makeRepos() {
  const created: Omit<Journal, "id" | "createdAt">[] = [];
  const journalRepository = {
    create: mock(async (journal: Omit<Journal, "id" | "createdAt">) => {
      created.push(journal);
      return { ...journal, id: "journal-1", createdAt: new Date() };
    }),
  } as unknown as JournalRepository;
  return { repositories: { journalRepository }, created };
}

const attachment = { id: "att-1", filename: "design.png" };

describe("journalizeAttachment", () => {
  it("records the filename in newValue when an attachment is added", async () => {
    const { repositories, created } = makeRepos();
    await journalizeAttachment(repositories, { issueId: "issue-1", userId: "user-1", attachment, change: "added" });
    expect(created[0].details).toEqual([
      { property: "attachment", fieldName: "att-1", oldValue: null, newValue: "design.png" },
    ]);
  });

  it("records the filename in oldValue when an attachment is removed", async () => {
    const { repositories, created } = makeRepos();
    await journalizeAttachment(repositories, { issueId: "issue-1", userId: "user-1", attachment, change: "removed" });
    expect(created[0].details).toEqual([
      { property: "attachment", fieldName: "att-1", oldValue: "design.png", newValue: null },
    ]);
  });

  it("journalizes against the issue, with no notes of its own", async () => {
    const { repositories, created } = makeRepos();
    await journalizeAttachment(repositories, { issueId: "issue-1", userId: "user-2", attachment, change: "added" });
    expect(created[0].journalizedType).toBe("Issue");
    expect(created[0].journalizedId).toBe("issue-1");
    expect(created[0].userId).toBe("user-2");
    expect(created[0].notes).toBe("");
  });
});
