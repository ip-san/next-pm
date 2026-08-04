import { describe, expect, it } from "bun:test";
import { parseTimelog, scanCommitMessage } from "./keyword-scan";

describe("parseTimelog", () => {
  it("parses a bare hours value", () => {
    expect(parseTimelog("2h")).toBe(2);
  });

  it("parses hours and minutes combined", () => {
    expect(parseTimelog("2h30m")).toBe(2.5);
    expect(parseTimelog("1h15m")).toBe(1.25);
  });

  it("parses bare minutes", () => {
    expect(parseTimelog("90m")).toBe(1.5);
    expect(parseTimelog("90min")).toBe(1.5);
  });

  it("parses H:MM", () => {
    expect(parseTimelog("1:30")).toBe(1.5);
  });

  it("parses a bare number as hours", () => {
    expect(parseTimelog("2")).toBe(2);
  });

  it("accepts a decimal with '.' or ',' as the separator", () => {
    expect(parseTimelog("2.5")).toBe(2.5);
    expect(parseTimelog("2,5")).toBe(2.5);
  });

  it("accepts a decimal with a trailing 'h'", () => {
    expect(parseTimelog("2.5h")).toBe(2.5);
  });

  it("returns null for garbage", () => {
    expect(parseTimelog("not-a-time")).toBeNull();
    expect(parseTimelog("")).toBeNull();
  });
});

const DEFAULT_OPTIONS = { refKeywords: ["refs", "references"], fixKeywords: ["fixes", "closes"] };

describe("scanCommitMessage", () => {
  it("links a reference introduced by a configured ref keyword", () => {
    expect(scanCommitMessage("refs #eb0b2d1a", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "ref", hours: null },
    ]);
  });

  it("is case-insensitive on both the keyword and the hex prefix", () => {
    expect(scanCommitMessage("Refs #EB0B2D1A", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "ref", hours: null },
    ]);
  });

  it("marks a fix-keyword reference as a fix action", () => {
    expect(scanCommitMessage("fixes #eb0b2d1a", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "fix", hours: null },
    ]);
    expect(scanCommitMessage("Closes #eb0b2d1a", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "fix", hours: null },
    ]);
  });

  it("ignores a bare reference with no keyword by default", () => {
    expect(scanCommitMessage("see #eb0b2d1a for details", DEFAULT_OPTIONS)).toEqual([]);
  });

  it("ignores an unrelated word immediately before a reference", () => {
    // "prefixes" must not be treated as containing the "fixes" keyword.
    expect(scanCommitMessage("prefixes #eb0b2d1a", DEFAULT_OPTIONS)).toEqual([]);
  });

  it("links a bare reference when refKeywords includes the '*' wildcard", () => {
    expect(scanCommitMessage("see #eb0b2d1a for details", { refKeywords: ["*"], fixKeywords: [] })).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "ref", hours: null },
    ]);
  });

  it("still requires a fix keyword for a fix action even with the wildcard set", () => {
    const result = scanCommitMessage("fixes #eb0b2d1a", { refKeywords: ["*"], fixKeywords: ["fixes"] });
    expect(result).toEqual([{ issueIdPrefix: "eb0b2d1a", action: "fix", hours: null }]);
  });

  it("extracts an hours annotation on a single reference", () => {
    expect(scanCommitMessage("fixes #eb0b2d1a @2h", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "fix", hours: 2 },
    ]);
  });

  it("handles multiple comma/semicolon/ampersand-separated references sharing one keyword", () => {
    expect(scanCommitMessage("refs #eb0b2d1a, #a1b2c3d4; #11223344 & #55667788", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "ref", hours: null },
      { issueIdPrefix: "a1b2c3d4", action: "ref", hours: null },
      { issueIdPrefix: "11223344", action: "ref", hours: null },
      { issueIdPrefix: "55667788", action: "ref", hours: null },
    ]);
  });

  it("breaks the reference run at a literal word like 'and' — only whitespace/,/;/& separate refs", () => {
    // Mirrors Redmine's own separator regex ([\s,;&]+): "and" is not among the accepted
    // separators, so a keyword-less "#11223344" after it is not linked (same as "see #...").
    expect(scanCommitMessage("refs #eb0b2d1a and #11223344", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "ref", hours: null },
    ]);
  });

  it("applies distinct hours per reference within the same group", () => {
    expect(scanCommitMessage("refs #eb0b2d1a @1h, #a1b2c3d4 @30m", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "ref", hours: 1 },
      { issueIdPrefix: "a1b2c3d4", action: "ref", hours: 0.5 },
    ]);
  });

  it("finds multiple independent keyword groups in one message", () => {
    expect(scanCommitMessage("fixes #eb0b2d1a. also refs #a1b2c3d4.", DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "fix", hours: null },
      { issueIdPrefix: "a1b2c3d4", action: "ref", hours: null },
    ]);
  });

  it("scans across multiple lines (full commit body, not just the subject)", () => {
    const message = "Add login form\n\nThis fixes #eb0b2d1a and closes #a1b2c3d4.";
    expect(scanCommitMessage(message, DEFAULT_OPTIONS)).toEqual([
      { issueIdPrefix: "eb0b2d1a", action: "fix", hours: null },
      { issueIdPrefix: "a1b2c3d4", action: "fix", hours: null },
    ]);
  });

  it("returns nothing when there are no keywords configured and no wildcard", () => {
    expect(scanCommitMessage("fixes #eb0b2d1a", { refKeywords: [], fixKeywords: [] })).toEqual([]);
  });

  it("returns nothing for a message with no hex-prefix references at all", () => {
    expect(scanCommitMessage("just a regular commit message", DEFAULT_OPTIONS)).toEqual([]);
  });

  it("does not match a 7- or 9-character hex run as a prefix", () => {
    expect(scanCommitMessage("refs #eb0b2d1", DEFAULT_OPTIONS)).toEqual([]);
    expect(scanCommitMessage("refs #eb0b2d1aa", DEFAULT_OPTIONS)).toEqual([]);
  });
});
