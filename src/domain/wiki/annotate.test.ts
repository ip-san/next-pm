import { describe, expect, it } from "bun:test";
import { annotateWikiContent } from "./annotate";

describe("annotateWikiContent", () => {
  it("attributes every line of a single version to that version", () => {
    const annotated = annotateWikiContent([{ version: 1, authorId: "alice", text: "a\nb" }]);
    expect(annotated).toEqual([
      { text: "a", version: 1, authorId: "alice" },
      { text: "b", version: 1, authorId: "alice" },
    ]);
  });

  it("attributes an added line to the version that added it and leaves the rest alone", () => {
    const annotated = annotateWikiContent([
      { version: 1, authorId: "alice", text: "a\nb" },
      { version: 2, authorId: "bob", text: "a\nnew\nb" },
    ]);
    expect(annotated).toEqual([
      { text: "a", version: 1, authorId: "alice" },
      { text: "new", version: 2, authorId: "bob" },
      { text: "b", version: 1, authorId: "alice" },
    ]);
  });

  it("re-attributes a line that was changed rather than kept", () => {
    const annotated = annotateWikiContent([
      { version: 1, authorId: "alice", text: "a\nb" },
      { version: 2, authorId: "bob", text: "a\nB!" },
    ]);
    expect(annotated).toEqual([
      { text: "a", version: 1, authorId: "alice" },
      { text: "B!", version: 2, authorId: "bob" },
    ]);
  });

  it("keeps the original attribution when a line is deleted and the rest survive", () => {
    const annotated = annotateWikiContent([
      { version: 1, authorId: "alice", text: "a\nb\nc" },
      { version: 2, authorId: "bob", text: "a\nc" },
    ]);
    expect(annotated).toEqual([
      { text: "a", version: 1, authorId: "alice" },
      { text: "c", version: 1, authorId: "alice" },
    ]);
  });

  it("credits a line to its first appearance across three versions", () => {
    const annotated = annotateWikiContent([
      { version: 1, authorId: "alice", text: "a" },
      { version: 2, authorId: "bob", text: "a\nb" },
      { version: 3, authorId: "carol", text: "a\nb\nc" },
    ]);
    expect(annotated.map((line) => [line.text, line.version, line.authorId])).toEqual([
      ["a", 1, "alice"],
      ["b", 2, "bob"],
      ["c", 3, "carol"],
    ]);
  });

  it("returns nothing for no versions", () => {
    expect(annotateWikiContent([])).toEqual([]);
  });

  it("annotates an empty version to no lines", () => {
    expect(annotateWikiContent([{ version: 1, authorId: "alice", text: "" }])).toEqual([]);
  });
});
