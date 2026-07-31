import { describe, expect, it } from "bun:test";
import { encodeCsv } from "./encode";
import { parseCsv } from "./decode";

describe("parseCsv", () => {
  it("splits plain fields by comma and rows by CRLF", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("splits rows by bare newline too", () => {
    expect(parseCsv("a,b\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("unquotes a field containing a comma", () => {
    expect(parseCsv('"a,b",c\r\n')).toEqual([["a,b", "c"]]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsv('"say ""hi"""\r\n')).toEqual([['say "hi"']]);
  });

  it("preserves a newline embedded inside a quoted field", () => {
    expect(parseCsv('"line1\nline2"\r\n')).toEqual([["line1\nline2"]]);
  });

  it("treats an empty field as an empty string", () => {
    expect(parseCsv(",x\r\n")).toEqual([["", "x"]]);
  });

  it("handles input with no trailing newline", () => {
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("round-trips through encodeCsv for a variety of tricky fields", () => {
    const original = [
      ["subject", "description"],
      ["Fix the, thing", 'He said "hello"\nmultiple lines'],
      ["=cmd|calc", "plain"],
    ];
    expect(parseCsv(encodeCsv(original))).toEqual(original.map((row) => row.map((field) => (/^[=+\-@]/.test(field) ? `'${field}` : field))));
  });
});
