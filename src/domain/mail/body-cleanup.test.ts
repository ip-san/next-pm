import { describe, expect, it } from "bun:test";
import { cleanupBody } from "./body-cleanup";

describe("cleanupBody", () => {
  it("returns the trimmed body when no delimiter is configured", () => {
    expect(cleanupBody("  the note  \n", { delimiters: "", enableRegex: false })).toBe("the note");
  });

  it("drops everything from the delimiter line onwards", () => {
    const body = ["the note", "--", "Alice", "Example Inc."].join("\n");
    expect(cleanupBody(body, { delimiters: "--", enableRegex: false })).toBe("the note");
  });

  it("matches a delimiter that a mail client has quoted", () => {
    const body = ["the note", "> -----Original Message-----", "> quoted history"].join("\n");
    expect(cleanupBody(body, { delimiters: "-----Original Message-----", enableRegex: false })).toBe("the note");
  });

  it("lets a single space in a literal delimiter match a line break", () => {
    const body = ["the note", "Sent from", "my phone", "signature"].join("\n");
    expect(cleanupBody(body, { delimiters: "Sent from my phone", enableRegex: false })).toBe("the note");
  });

  it("accepts several delimiters, one per line, and cuts at the first match", () => {
    const body = ["the note", "________", "history"].join("\n");
    expect(cleanupBody(body, { delimiters: "--\n________", enableRegex: false })).toBe("the note");
  });

  it("treats a delimiter as a regular expression when the option is on", () => {
    const body = ["the note", "On 2026-01-02 Alice wrote:", "> quoted"].join("\n");
    expect(cleanupBody(body, { delimiters: "^On .* wrote:$", enableRegex: true })).toBe("the note");
  });

  it("ignores an invalid regular expression instead of dropping the body", () => {
    const body = "the note\n--\nsignature";
    expect(cleanupBody(body, { delimiters: "[unclosed", enableRegex: true })).toBe(body);
  });

  it("does not treat a delimiter appearing mid-line as a cut point", () => {
    const body = "the note mentions -- inline\nand continues";
    expect(cleanupBody(body, { delimiters: "--", enableRegex: false })).toBe(body);
  });
});
