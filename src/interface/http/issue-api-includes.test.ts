import { describe, expect, it } from "bun:test";
import { parseIssueIncludes } from "./issue-api-includes";

describe("parseIssueIncludes", () => {
  it("returns nothing when include is absent", () => {
    expect(parseIssueIncludes(null).size).toBe(0);
  });

  it("reads a comma-separated list and ignores names it does not know", () => {
    const parsed = parseIssueIncludes("children, relations,nonsense,allowed_statuses");
    expect([...parsed].sort()).toEqual(["allowed_statuses", "children", "relations"]);
  });
});
