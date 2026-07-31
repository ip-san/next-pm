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
});
