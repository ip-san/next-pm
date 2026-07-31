import { describe, expect, it } from "bun:test";
import { parseBlamePorcelain } from "./parse-blame";

function porcelainRecord(hash: string, finalLine: number, author: string, authorTime: number, content: string): string {
  return [
    `${hash} ${finalLine} ${finalLine} 1`,
    `author ${author}`,
    `author-mail <${author}@example.com>`,
    `author-time ${authorTime}`,
    "author-tz +0000",
    `committer ${author}`,
    "committer-mail <a@example.com>",
    `committer-time ${authorTime}`,
    "committer-tz +0000",
    "summary a commit",
    "filename src/example.ts",
    `\t${content}`,
  ].join("\n");
}

describe("parseBlamePorcelain", () => {
  it("extracts commit hash, author, date, and content per line", () => {
    const hash = "a".repeat(40);
    const output = porcelainRecord(hash, 1, "Alice", 1_700_000_000, "const x = 1;");
    const lines = parseBlamePorcelain(output);
    expect(lines).toEqual([
      {
        lineNumber: 1,
        commitHash: hash,
        author: "Alice",
        date: new Date(1_700_000_000 * 1000).toISOString().slice(0, 10),
        content: "const x = 1;",
      },
    ]);
  });

  it("parses multiple lines from different commits independently", () => {
    const hashA = "a".repeat(40);
    const hashB = "b".repeat(40);
    const output = [porcelainRecord(hashA, 1, "Alice", 1_700_000_000, "line one"), porcelainRecord(hashB, 2, "Bob", 1_710_000_000, "line two")].join(
      "\n",
    );
    const lines = parseBlamePorcelain(output);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ lineNumber: 1, commitHash: hashA, author: "Alice", content: "line one" });
    expect(lines[1]).toMatchObject({ lineNumber: 2, commitHash: hashB, author: "Bob", content: "line two" });
  });

  it("preserves a tab character that appears inside the line content itself", () => {
    const hash = "c".repeat(40);
    const output = porcelainRecord(hash, 1, "Alice", 1_700_000_000, "if (x)\tdoSomething();");
    const lines = parseBlamePorcelain(output);
    expect(lines[0].content).toBe("if (x)\tdoSomething();");
  });

  it("returns an empty array for empty input", () => {
    expect(parseBlamePorcelain("")).toEqual([]);
  });
});
