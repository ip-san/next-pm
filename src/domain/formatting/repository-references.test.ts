import { describe, expect, it } from "bun:test";
import { linkRevisionReferences, linkWikiReferences, parseWikiTarget, wikiLinkLabel, revisionReferenceIds, wikiReferenceTargets } from "./repository-references";

describe("wiki references", () => {
  it("finds the page titles a text links to, outside code", () => {
    expect(wikiReferenceTargets("See [[Setup]] and [[Setup|the setup]], not `[[Code]]`.")).toEqual(["Setup"]);
  });

  it("keeps the project prefix in the target, so the same title in two projects stays apart", () => {
    expect(wikiReferenceTargets("[[shop:Setup]] [[Setup]] [[shop:Setup|again]]")).toEqual(["shop:Setup", "Setup"]);
  });

  it("splits a target at its first colon into project and page", () => {
    expect(parseWikiTarget("Setup")).toEqual({ project: null, title: "Setup", anchor: null });
    expect(parseWikiTarget("shop:Setup")).toEqual({ project: "shop", title: "Setup", anchor: null });
    expect(parseWikiTarget(" shop : Setup ")).toEqual({ project: "shop", title: "Setup", anchor: null });
    expect(parseWikiTarget("shop:")).toEqual({ project: "shop", title: "", anchor: null });
    expect(parseWikiTarget("shop:Setup:two")).toEqual({ project: "shop", title: "Setup:two", anchor: null });
  });

  it("keeps a colon with nothing before it as part of the title", () => {
    expect(parseWikiTarget(":Setup")).toEqual({ project: null, title: ":Setup", anchor: null });
  });

  it("labels a project-qualified link with its page title, not the project", () => {
    const links = new Map([["shop:Setup", { href: "/projects/shop/wiki/Setup" }]]);
    expect(linkWikiReferences("[[shop:Setup]] and [[shop:Setup|install]]", links)).toBe(
      "[Setup](/projects/shop/wiki/Setup) and [install](/projects/shop/wiki/Setup)",
    );
  });

  it("does not link a project-qualified reference that has no link, even when its page title has one", () => {
    const links = new Map([["Setup", { href: "/projects/blog/wiki/Setup" }]]);
    expect(linkWikiReferences("[[secret:Setup]] and [[Setup]]", links)).toBe("[[secret:Setup]] and [Setup](/projects/blog/wiki/Setup)");
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

describe("wiki link sections and start pages", () => {
  it("splits a section off the page, and reads #anchor alone as a section of this page", () => {
    expect(parseWikiTarget("Setup#Install steps")).toEqual({ project: null, title: "Setup", anchor: "Install steps" });
    expect(parseWikiTarget("shop:Setup#Install")).toEqual({ project: "shop", title: "Setup", anchor: "Install" });
    expect(parseWikiTarget("#Install")).toEqual({ project: null, title: "", anchor: "Install" });
    expect(parseWikiTarget("C#")).toEqual({ project: null, title: "C#", anchor: null });
  });

  it("labels a link as Redmine does when it has no label of its own", () => {
    expect(wikiLinkLabel(parseWikiTarget("Setup#Install"))).toBe("Setup");
    expect(wikiLinkLabel(parseWikiTarget("#Install"))).toBe("#Install");
    expect(wikiLinkLabel(parseWikiTarget("shop:"))).toBe("shop");
  });

  it("links a section and a start page with the href it was given", () => {
    const links = new Map([
      ["#Install", { href: "#Install" }],
      ["shop:", { href: "/projects/shop/wiki/Wiki" }],
    ]);
    expect(linkWikiReferences("See [[#Install]] and [[shop:]].", links)).toBe("See [#Install](#Install) and [shop](/projects/shop/wiki/Wiki).");
  });
});

