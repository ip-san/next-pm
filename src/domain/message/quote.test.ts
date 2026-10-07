import { describe, expect, it } from "bun:test";
import { buildQuote, quotedSubject } from "./quote";

describe("buildQuote", () => {
  it("prefixes every line with '> ' under a 'wrote:' header", () => {
    expect(buildQuote("Alice", "first\nsecond")).toBe("Alice wrote:\n> first\n> second\n\n");
  });

  it("normalizes CRLF so Windows input does not produce stray carriage returns", () => {
    expect(buildQuote("Alice", "first\r\nsecond")).toBe("Alice wrote:\n> first\n> second\n\n");
  });

  it("strips surrounding whitespace before quoting", () => {
    expect(buildQuote("Alice", "\n  body  \n")).toBe("Alice wrote:\n> body\n\n");
  });
});

describe("quotedSubject", () => {
  it("adds the RE: prefix", () => {
    expect(quotedSubject("Release plan")).toBe("RE: Release plan");
  });

  it("does not stack RE: prefixes", () => {
    expect(quotedSubject("RE: Release plan")).toBe("RE: Release plan");
  });
});
