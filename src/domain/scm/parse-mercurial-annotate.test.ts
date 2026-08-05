import { describe, expect, it } from "bun:test";
import { parseMercurialAnnotate } from "./parse-mercurial-annotate";

describe("parseMercurialAnnotate", () => {
  it("parses one record per source line, stripping the line's trailing newline", () => {
    const output =
      "1\x1fed5d8e14f2f7666aeb87acd4bec2c224fb352788\x1falice\x1f2026-08-05 22:26:18 +0900\x1fhello\n\x1e" +
      "2\x1f0d390d9d67d94f695e14b538f73f620018ae4391\x1fbob\x1f2026-08-05 22:26:18 +0900\x1fworld\n\x1e";

    expect(parseMercurialAnnotate(output)).toEqual([
      { lineNumber: 1, commitHash: "ed5d8e14f2f7666aeb87acd4bec2c224fb352788", author: "alice", date: "2026-08-05 22:26:18 +0900", content: "hello" },
      { lineNumber: 2, commitHash: "0d390d9d67d94f695e14b538f73f620018ae4391", author: "bob", date: "2026-08-05 22:26:18 +0900", content: "world" },
    ]);
  });

  it("preserves a genuinely blank source line rather than dropping it", () => {
    const output = "1\x1fabc\x1falice\x1f2026-01-01 00:00:00 +0000\x1f\n\x1e";
    expect(parseMercurialAnnotate(output)).toEqual([{ lineNumber: 1, commitHash: "abc", author: "alice", date: "2026-01-01 00:00:00 +0000", content: "" }]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseMercurialAnnotate("")).toEqual([]);
  });
});
