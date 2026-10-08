import { describe, expect, it } from "bun:test";
import { isJournalVisible, splitPrivateNote, visibleJournalsFor } from "./visibility";

const publicNote = { privateNotes: false, userId: "author-1" };
const privateNote = { privateNotes: true, userId: "author-1" };

describe("isJournalVisible", () => {
  it("shows a public note to anyone, including an anonymous visitor", () => {
    expect(isJournalVisible(publicNote, { userId: null, canViewPrivateNotes: false })).toBe(true);
    expect(isJournalVisible(publicNote, { userId: "someone", canViewPrivateNotes: false })).toBe(true);
  });

  it("hides a private note from a viewer without the permission", () => {
    expect(isJournalVisible(privateNote, { userId: "someone", canViewPrivateNotes: false })).toBe(false);
  });

  it("hides a private note from an anonymous visitor", () => {
    expect(isJournalVisible(privateNote, { userId: null, canViewPrivateNotes: false })).toBe(false);
  });

  it("shows a private note to a viewer holding view_private_notes", () => {
    expect(isJournalVisible(privateNote, { userId: "someone", canViewPrivateNotes: true })).toBe(true);
  });

  it("always shows a private note to its own author", () => {
    // Redmine's `user_id = ?` clause: losing the permission doesn't hide your own note.
    expect(isJournalVisible(privateNote, { userId: "author-1", canViewPrivateNotes: false })).toBe(true);
  });
});

describe("visibleJournalsFor", () => {
  it("keeps only the journals the viewer may see, in order", () => {
    const journals = [
      { id: "a", privateNotes: false, userId: "other" },
      { id: "b", privateNotes: true, userId: "other" },
      { id: "c", privateNotes: true, userId: "me" },
    ];
    const visible = visibleJournalsFor(journals, { userId: "me", canViewPrivateNotes: false });
    expect(visible.map((journal) => journal.id)).toEqual(["a", "c"]);
  });
});

describe("splitPrivateNote", () => {
  const details = [{ property: "attr", fieldName: "statusId", oldValue: "a", newValue: "b" }];

  it("leaves a public journal alone", () => {
    const journal = { notes: "hello", privateNotes: false, details };
    expect(splitPrivateNote(journal)).toEqual([journal]);
  });

  it("leaves a private note with no details as one journal", () => {
    const journal = { notes: "secret", privateNotes: true, details: [] };
    expect(splitPrivateNote(journal)).toEqual([journal]);
  });

  it("clears the private flag when the note is blank", () => {
    // Nothing to hide, and keeping the flag would hide the details for no reason.
    const journal = { notes: "   ", privateNotes: true, details };
    expect(splitPrivateNote(journal)).toEqual([{ ...journal, privateNotes: false }]);
  });

  it("splits a private note that carries details, keeping the changes public", () => {
    // Otherwise marking the note private would also hide the status change from everyone
    // without view_private_notes.
    const journal = { notes: "secret", privateNotes: true, details };
    expect(splitPrivateNote(journal)).toEqual([
      { notes: "", privateNotes: false, details },
      { notes: "secret", privateNotes: true, details: [] },
    ]);
  });
});
