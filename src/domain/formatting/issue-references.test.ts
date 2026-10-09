import { describe, expect, it } from "bun:test";
import { issueReferenceNumbers, linkIssueReferences } from "./issue-references";

describe("issueReferenceNumbers", () => {
  it("finds the distinct numbers a text references", () => {
    expect(issueReferenceNumbers("see #12 and #7, again #12")).toEqual([12, 7]);
  });

  it("skips references inside code", () => {
    expect(issueReferenceNumbers("`#5` and ```\n#6\n``` and #7")).toEqual([7]);
  });

  it("needs a boundary before the hash", () => {
    expect(issueReferenceNumbers("a#1 &#2 http://x/#3 #4x")).toEqual([]);
  });
});

describe("linkIssueReferences", () => {
  it("links the numbers that have a link and leaves the rest as text", () => {
    const links = new Map([[12, { href: "/projects/shop/issues/abc", title: "Login fails" }]]);
    expect(linkIssueReferences("see #12 and #99", links)).toBe('see [#12](/projects/shop/issues/abc "Login fails") and #99');
  });

  it("never links inside code", () => {
    const links = new Map([[5, { href: "/x", title: "T" }]]);
    expect(linkIssueReferences("`#5`", links)).toBe("`#5`");
  });

  it("keeps the title from breaking the link's markup", () => {
    const links = new Map([[1, { href: "/x", title: 'A "quoted" [title](evil)' }]]);
    expect(linkIssueReferences("#1", links)).toBe('[#1](/x "A quoted title evil")');
  });
});
