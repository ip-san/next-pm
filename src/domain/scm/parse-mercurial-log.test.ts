import { describe, expect, it } from "bun:test";
import { parseMercurialLog } from "./parse-mercurial-log";

describe("parseMercurialLog", () => {
  it("parses multiple records separated by \\x1e, fields separated by \\x1f", () => {
    const output =
      "0d390d9d67d94f695e14b538f73f620018ae4391\x1fbob\x1fbob@example.com\x1f2026-08-05 22:26:18 +0900\x1fsecond commit\n\nwith a body line\x1e" +
      "ed5d8e14f2f7666aeb87acd4bec2c224fb352788\x1falice\x1falice@example.com\x1f2026-08-05 22:26:18 +0900\x1finitial commit\x1e";

    const commits = parseMercurialLog(output);
    expect(commits).toEqual([
      {
        hash: "0d390d9d67d94f695e14b538f73f620018ae4391",
        author: "bob",
        authorEmail: "bob@example.com",
        date: "2026-08-05 22:26:18 +0900",
        message: "second commit\n\nwith a body line",
      },
      {
        hash: "ed5d8e14f2f7666aeb87acd4bec2c224fb352788",
        author: "alice",
        authorEmail: "alice@example.com",
        date: "2026-08-05 22:26:18 +0900",
        message: "initial commit",
      },
    ]);
  });

  it("returns an empty array for an empty repository", () => {
    expect(parseMercurialLog("")).toEqual([]);
  });
});
