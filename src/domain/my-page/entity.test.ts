import { describe, expect, it } from "bun:test";
import { isIssueQueryBlock, isMyPageBlockType, nextIssueQueryBlockId } from "./entity";

describe("isMyPageBlockType", () => {
  it("accepts the static blocks and the three issue-query ids, and nothing else", () => {
    expect(isMyPageBlockType("calendar")).toBe(true);
    expect(isMyPageBlockType("issuequery__2")).toBe(true);
    expect(isMyPageBlockType("issuequery__3")).toBe(false);
    expect(isMyPageBlockType("everything")).toBe(false);
  });

  it("marks the issue-query ids", () => {
    expect(isIssueQueryBlock("issuequery")).toBe(true);
    expect(isIssueQueryBlock("news")).toBe(false);
  });
});

describe("nextIssueQueryBlockId", () => {
  it("takes the first id not on the page", () => {
    expect(nextIssueQueryBlockId([])).toBe("issuequery");
    expect(nextIssueQueryBlockId(["issuequery", "news"])).toBe("issuequery__1");
  });

  it("returns null once all three are placed", () => {
    expect(nextIssueQueryBlockId(["issuequery", "issuequery__1", "issuequery__2"])).toBeNull();
  });
});
