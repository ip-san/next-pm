import { describe, expect, it } from "bun:test";
import { renderFormattedText } from "./markdown";

describe("renderFormattedText", () => {
  it("renders CommonMark structure", () => {
    expect(renderFormattedText("# Title\n\n- one\n- two")).toContain("<h1>Title</h1>");
    expect(renderFormattedText("**bold**")).toContain("<strong>bold</strong>");
  });

  it("escapes a script tag rather than emitting it", () => {
    const html = renderFormattedText("<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an image's event handler rather than emitting the tag", () => {
    const html = renderFormattedText("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
  });

  it("escapes a raw anchor with a javascript href", () => {
    const html = renderFormattedText('<a href="javascript:alert(1)">x</a>');
    expect(html).not.toContain("<a href");
    expect(html).toContain("&lt;a href=&quot;javascript:alert(1)&quot;&gt;");
  });

  it("blanks a markdown link to javascript:, in any case", () => {
    expect(renderFormattedText("[x](javascript:alert(1))")).toContain('<a href="">x</a>');
    expect(renderFormattedText("[x](JaVaScRiPt:alert(1))")).toContain('<a href="">x</a>');
  });

  it("blanks a link whose scheme is entity-encoded", () => {
    expect(renderFormattedText("[x](&#106;avascript:alert(1))")).toContain('<a href="">x</a>');
  });

  it("blanks a data: link and a vbscript: link", () => {
    expect(renderFormattedText("[x](data:text/html,<script>alert(1)</script>)")).toContain('<a href="">x</a>');
    expect(renderFormattedText("[x](vbscript:msgbox(1))")).toContain('<a href="">x</a>');
  });

  it("blanks the address of an image with a javascript: source", () => {
    expect(renderFormattedText("![x](javascript:alert(1))")).toContain('src=""');
  });

  it("doesn't turn an autolink with a javascript: scheme into a link", () => {
    const html = renderFormattedText("<javascript:alert(1)>");
    expect(html).not.toContain('href="javascript:');
  });

  it("keeps an https link", () => {
    expect(renderFormattedText("[x](https://example.com/a)")).toContain('<a href="https://example.com/a">x</a>');
  });

  it("keeps entity text as text, not markup", () => {
    expect(renderFormattedText("&lt;b&gt;text&lt;/b&gt;")).toContain("&lt;b&gt;text&lt;/b&gt;");
  });
});
