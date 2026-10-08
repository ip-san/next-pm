import { describe, expect, it } from "bun:test";
import { parseCommitterIdentity } from "./committer";

describe("parseCommitterIdentity", () => {
  it("splits a git-style 'Name <email>' committer", () => {
    expect(parseCommitterIdentity("Alice Dev <alice@example.com>")).toEqual({ username: "Alice Dev", email: "alice@example.com" });
  });

  it("treats a bare name as a username with no email", () => {
    expect(parseCommitterIdentity("alice")).toEqual({ username: "alice", email: null });
  });

  it("strips surrounding whitespace before matching", () => {
    expect(parseCommitterIdentity("  alice  ")).toEqual({ username: "alice", email: null });
  });

  it("treats empty angle brackets as no email", () => {
    expect(parseCommitterIdentity("Alice Dev <>")).toEqual({ username: "Alice Dev", email: null });
  });

  // Redmine's /^([^<]+)(<(.*)>)?$/ needs at least one character before the bracket.
  it("does not match a committer that is only an email in angle brackets", () => {
    expect(parseCommitterIdentity("<alice@example.com>")).toBeNull();
  });

  it("does not match an empty committer", () => {
    expect(parseCommitterIdentity("   ")).toBeNull();
  });
});
