import { describe, expect, it } from "bun:test";
import { parseSvnLog } from "./parse-svn-log";

const SAMPLE_OUTPUT = `------------------------------------------------------------------------
r2 | bob | 2026-08-05 22:25:00 +0900 (Wed, 05 Aug 2026) | 2 lines

second commit
with a body line
------------------------------------------------------------------------
r1 | alice | 2026-08-05 22:24:59 +0900 (Wed, 05 Aug 2026) | 1 line

initial commit
------------------------------------------------------------------------
`;

describe("parseSvnLog", () => {
  it("parses multiple log entries in newest-first order", () => {
    const commits = parseSvnLog(SAMPLE_OUTPUT);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({
      hash: "2",
      author: "bob",
      authorEmail: "",
      date: "2026-08-05 22:25:00 +0900",
      message: "second commit\nwith a body line",
    });
    expect(commits[1]).toEqual({
      hash: "1",
      author: "alice",
      authorEmail: "",
      date: "2026-08-05 22:24:59 +0900",
      message: "initial commit",
    });
  });

  it("returns an empty array for a repository with no matching history", () => {
    expect(parseSvnLog("")).toEqual([]);
    expect(parseSvnLog("\n")).toEqual([]);
  });

  it("handles a message with no body (single-line, 1 line declared)", () => {
    const output = `------------------------------------------------------------------------
r5 | carol | 2024-01-01 00:00:00 +0000 (Mon, 01 Jan 2024) | 1 line

Just a subject
------------------------------------------------------------------------
`;
    const commits = parseSvnLog(output);
    expect(commits).toEqual([{ hash: "5", author: "carol", authorEmail: "", date: "2024-01-01 00:00:00 +0000", message: "Just a subject" }]);
  });
});
