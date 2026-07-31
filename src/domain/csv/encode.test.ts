import { describe, expect, it } from "bun:test";
import { encodeCsv } from "./encode";

describe("encodeCsv", () => {
  it("joins plain fields with commas and rows with CRLF", () => {
    expect(encodeCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d\r\n");
  });

  it("quotes a field containing a comma", () => {
    expect(encodeCsv([["a,b", "c"]])).toBe('"a,b",c\r\n');
  });

  it("quotes and doubles internal quotes", () => {
    expect(encodeCsv([['say "hi"']])).toBe('"say ""hi"""\r\n');
  });

  it("quotes a field containing a newline", () => {
    expect(encodeCsv([["line1\nline2"]])).toBe('"line1\nline2"\r\n');
  });

  it("leaves an empty field bare", () => {
    expect(encodeCsv([["", "x"]])).toBe(",x\r\n");
  });

  it("neutralizes a leading = to prevent formula injection", () => {
    expect(encodeCsv([["=cmd|'/c calc'!A1"]])).toBe("'=cmd|'/c calc'!A1\r\n");
  });

  it("neutralizes leading +, -, and @", () => {
    expect(encodeCsv([["+1+1"]])).toBe("'+1+1\r\n");
    expect(encodeCsv([["-1+1"]])).toBe("'-1+1\r\n");
    expect(encodeCsv([["@1+1"]])).toBe("'@1+1\r\n");
  });

  it("neutralizes a leading tab or CR (still quoted, since CR also triggers quoting)", () => {
    expect(encodeCsv([["\t1+1"]])).toBe("'\t1+1\r\n");
    expect(encodeCsv([["\r1+1"]])).toBe('"\'\r1+1"\r\n');
  });

  it("does not touch a field with = in the middle", () => {
    expect(encodeCsv([["a=b"]])).toBe("a=b\r\n");
  });
});
