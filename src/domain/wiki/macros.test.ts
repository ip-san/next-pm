import { describe, expect, it } from "bun:test";
import { CircularIncludeError, expandMacros, extractHeadings, renderChildPages, renderToc } from "./macros";

describe("extractHeadings", () => {
  it("extracts Markdown ATX headings with their level", () => {
    const headings = extractHeadings("# Title\nsome text\n## Section One\nmore\n### Sub");
    expect(headings).toEqual([
      { level: 1, text: "Title", anchor: "title" },
      { level: 2, text: "Section One", anchor: "section-one" },
      { level: 3, text: "Sub", anchor: "sub" },
    ]);
  });

  it("ignores lines that aren't headings", () => {
    expect(extractHeadings("no headings here\njust text")).toEqual([]);
  });
});

describe("renderToc", () => {
  it("renders nested markdown links indented by heading level", () => {
    const toc = renderToc([
      { level: 1, text: "Title", anchor: "title" },
      { level: 2, text: "Section", anchor: "section" },
    ]);
    expect(toc).toBe("- [Title](#title)\n  - [Section](#section)");
  });

  it("returns an empty string when there are no headings", () => {
    expect(renderToc([])).toBe("");
  });
});

describe("renderChildPages", () => {
  it("renders a link per child page", () => {
    expect(renderChildPages([{ title: "Child A" }, { title: "Child B" }])).toBe("- [Child A](Child A)\n- [Child B](Child B)");
  });

  it("returns an empty string when there are no children", () => {
    expect(renderChildPages([])).toBe("");
  });
});

describe("expandMacros", () => {
  it("expands {{toc}} using the page's own headings", () => {
    const result = expandMacros("{{toc}}", { headings: [{ level: 1, text: "A", anchor: "a" }], childPages: [], resolveInclude: () => null });
    expect(result).toBe("- [A](#a)");
  });

  it("expands {{child_pages}} using the page's children", () => {
    const result = expandMacros("{{child_pages}}", { headings: [], childPages: [{ title: "Kid" }], resolveInclude: () => null });
    expect(result).toBe("- [Kid](Kid)");
  });

  it("expands {{include(title)}} with the resolved page's text", () => {
    const result = expandMacros("before {{include(Other)}} after", {
      headings: [],
      childPages: [],
      resolveInclude: (title) => (title === "Other" ? "included text" : null),
    });
    expect(result).toBe("before included text after");
  });

  it("recursively expands macros inside an included page", () => {
    const result = expandMacros("{{include(Other)}}", {
      headings: [],
      childPages: [],
      resolveInclude: (title) => (title === "Other" ? "# Heading\n{{toc}}" : null),
    });
    expect(result).toBe("# Heading\n- [Heading](#heading)");
  });

  it("leaves a [[title]] placeholder when the included page doesn't exist", () => {
    const result = expandMacros("{{include(Missing)}}", { headings: [], childPages: [], resolveInclude: () => null });
    expect(result).toBe("[[Missing]]");
  });

  it("throws CircularIncludeError instead of recursing forever on a mutual include cycle", () => {
    const pages: Record<string, string> = { A: "{{include(B)}}", B: "{{include(A)}}" };
    expect(() => expandMacros("{{include(A)}}", { headings: [], childPages: [], resolveInclude: (title) => pages[title] ?? null })).toThrow(
      CircularIncludeError,
    );
  });
});
