import { describe, expect, it } from "bun:test";
import { linkRevisionReferences, linkWikiReferences, revisionReferenceIds, wikiReferenceTitles } from "./repository-references";

describe("wiki references", () => {
  it("finds the page titles a text links to, outside code", () => {
    expect(wikiReferenceTitles("See [[Setup]] and [[Setup|the setup]], not `[[Code]]`.")).toEqual(["Setup"]);
  });

  it("links a page the viewer can read, with its label", () => {
    const links = new Map([["Setup", { href: "/projects/shop/wiki/Setup" }]]);
    expect(linkWikiReferences("[[Setup|install]] and [[Missing]]", links)).toBe("[install](/projects/shop/wiki/Setup) and [[Missing]]");
  });

  it("leaves a reference whose label has brackets as written, so no link is built from it", () => {
    const links = new Map([["Setup", { href: "/x" }]]);
    expect(linkWikiReferences("[[Setup|a [b] c]]", links)).toBe("[[Setup|a [b] c]]");
  });

  it("strips markup characters from a label that is linked", () => {
    const links = new Map([["Setup", { href: "/x" }]]);
    expect(linkWikiReferences("[[Setup|a\\b]]", links)).toBe("[a b](/x)");
  });
});

describe("revision references", () => {
  it("finds a revision id as a whole word, outside code", () => {
    expect(revisionReferenceIds("fixed in r3a1b2c4d and `r3a1b2c4d5` and r12")).toEqual(["3a1b2c4d"]);
  });

  it("needs a boundary before the r", () => {
    expect(revisionReferenceIds("ar3a1b2c4d or /r3a1b2c4d")).toEqual([]);
  });

  it("links only the ids that have a link", () => {
    const links = new Map([["3a1b2c4d", { href: "/projects/shop/repository/1/revisions/3a1b2c4d" }]]);
    expect(linkRevisionReferences("r3a1b2c4d and r7f7f7f7", links)).toBe(
      "[r3a1b2c4d](/projects/shop/repository/1/revisions/3a1b2c4d) and r7f7f7f7",
    );
  });
});
