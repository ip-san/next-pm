import { describe, expect, it } from "bun:test";
import { canDeleteMessage, canEditMessage } from "./authorization";

const message = { authorId: "author-1" };

describe("canEditMessage", () => {
  it("allows an author to edit their own message with edit_own_messages", () => {
    expect(canEditMessage(message, "author-1", false, true)).toBe(true);
  });

  it("denies a non-author edit_own_messages holder", () => {
    expect(canEditMessage(message, "other-user", false, true)).toBe(false);
  });

  it("allows any holder of edit_messages regardless of authorship", () => {
    expect(canEditMessage(message, "other-user", true, false)).toBe(true);
  });

  it("denies when neither permission is held", () => {
    expect(canEditMessage(message, "author-1", false, false)).toBe(false);
  });
});

describe("canDeleteMessage", () => {
  it("allows an author to delete their own message with delete_own_messages", () => {
    expect(canDeleteMessage(message, "author-1", false, true)).toBe(true);
  });

  it("denies a non-author delete_own_messages holder", () => {
    expect(canDeleteMessage(message, "other-user", false, true)).toBe(false);
  });

  it("allows any holder of delete_messages regardless of authorship", () => {
    expect(canDeleteMessage(message, "other-user", true, false)).toBe(true);
  });
});
