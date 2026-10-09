import { describe, expect, it } from "bun:test";
import { issueMailSubject } from "./subject";
import { extractIssueReplyRef } from "./parse-email";

describe("issueMailSubject", () => {
  it("carries the issue number, the token a reply is routed by", () => {
    expect(issueMailSubject("Shop", 42, "Login fails")).toBe("[Shop #42] Login fails");
  });

  it("round-trips through the reply parser", () => {
    expect(extractIssueReplyRef(issueMailSubject("Shop", 42, "Login fails"))).toBe("42");
  });

  it("still parses the older 8-hex prefix subjects", () => {
    expect(extractIssueReplyRef("Re: [Shop #eb0b2d1a] Login fails")).toBe("eb0b2d1a");
  });
});
