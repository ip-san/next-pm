import { describe, expect, it } from "bun:test";
import { AVAILABLE_MACROS, collectIssueRefs, parseWikiBlocks, type MacroBlockContext, type ResolvedIssue } from "./macro-blocks";

const issue: ResolvedIssue = {
  id: "eb0b2d1a-1111-4222-8333-444444444444",
  idPrefix: "eb0b2d1a",
  trackerName: "Bug",
  subject: "It breaks",
  projectName: "Demo",
  projectIdentifier: "demo",
};

function makeContext(overrides: Partial<MacroBlockContext> = {}): MacroBlockContext {
  return {
    findAttachment: (filename) => (filename === "shot.png" ? { id: "att-1", filename: "shot.png" } : null),
    resolveIssue: (prefix) => (prefix === issue.idPrefix ? issue : null),
    recentPages: () => [{ title: "Home", updatedAt: new Date("2026-01-02T03:04:05Z") }],
    ...overrides,
  };
}

describe("parseWikiBlocks", () => {
  it("passes text through untouched when there is no rendering macro", () => {
    expect(parseWikiBlocks("hello\nworld", makeContext())).toEqual([{ kind: "text", text: "hello\nworld" }]);
  });

  it("leaves an unknown macro in the text, as Redmine does", () => {
    expect(parseWikiBlocks("a {{nope(1)}} b", makeContext())).toEqual([{ kind: "text", text: "a {{nope(1)}} b" }]);
  });

  it("leaves the text macros from macros.ts alone", () => {
    expect(parseWikiBlocks("{{toc}}\n{{child_pages}}", makeContext())).toEqual([
      { kind: "text", text: "{{toc}}\n{{child_pages}}" },
    ]);
  });

  it("renders an escaped macro as literal text without the bang", () => {
    expect(parseWikiBlocks("!{{macro_list}}", makeContext())).toEqual([{ kind: "text", text: "{{macro_list}}" }]);
  });

  it("splits surrounding text around a macro", () => {
    const blocks = parseWikiBlocks("before {{macro_list}} after", makeContext());
    expect(blocks.map((b) => b.kind)).toEqual(["text", "macroList", "text"]);
    expect(blocks[0]).toEqual({ kind: "text", text: "before " });
    expect(blocks[2]).toEqual({ kind: "text", text: " after" });
  });

  describe("collapse", () => {
    it("captures the block of text and both labels", () => {
      const blocks = parseWikiBlocks("{{collapse(Show, Hide)\nsecret\n}}", makeContext());
      expect(blocks).toEqual([{ kind: "collapse", showLabel: "Show", hideLabel: "Hide", body: "secret" }]);
    });

    it("reuses the show label for hiding when only one is given", () => {
      const blocks = parseWikiBlocks("{{collapse(詳細)\nbody\n}}", makeContext());
      expect(blocks[0]).toMatchObject({ showLabel: "詳細", hideLabel: "詳細" });
    });

    it("falls back to a default label with no arguments", () => {
      const blocks = parseWikiBlocks("{{collapse\nbody\n}}", makeContext());
      expect(blocks[0]).toMatchObject({ kind: "collapse", showLabel: "表示", body: "body" });
    });
  });

  describe("thumbnail", () => {
    it("resolves an attachment of the page and defaults the size to 200", () => {
      expect(parseWikiBlocks("{{thumbnail(shot.png)}}", makeContext())).toEqual([
        { kind: "thumbnail", attachmentId: "att-1", filename: "shot.png", size: 200, title: "shot.png" },
      ]);
    });

    it("accepts size and title options", () => {
      expect(parseWikiBlocks("{{thumbnail(shot.png, size=300, title=Look)}}", makeContext())[0]).toMatchObject({
        size: 300,
        title: "Look",
      });
    });

    it("errors on a non-numeric size", () => {
      expect(parseWikiBlocks("{{thumbnail(shot.png, size=big)}}", makeContext())[0]).toMatchObject({ kind: "error" });
    });

    it("errors when the file is not attached to this page", () => {
      expect(parseWikiBlocks("{{thumbnail(other.png)}}", makeContext())[0]).toEqual({
        kind: "error",
        message: "添付ファイル other.png が見つかりません。",
      });
    });

    it("errors when no filename is given", () => {
      expect(parseWikiBlocks("{{thumbnail}}", makeContext())[0]).toMatchObject({ kind: "error" });
    });
  });

  describe("issue", () => {
    it("links a visible issue with its tracker and subject", () => {
      expect(parseWikiBlocks("{{issue(eb0b2d1a)}}", makeContext())).toEqual([
        {
          kind: "issue",
          label: "Bug #eb0b2d1a: It breaks",
          href: "/projects/demo/issues/eb0b2d1a-1111-4222-8333-444444444444",
        },
      ]);
    });

    it("honours subject, tracker and project options", () => {
      expect(parseWikiBlocks("{{issue(eb0b2d1a, subject=false, tracker=false, project=true)}}", makeContext())[0]).toEqual({
        kind: "issue",
        label: "Demo - #eb0b2d1a",
        href: "/projects/demo/issues/eb0b2d1a-1111-4222-8333-444444444444",
      });
    });

    // The subject must not leak: an issue the viewer can't see resolves to null and renders
    // as the bare reference, exactly as Redmine's Issue.visible fallback does.
    it("renders an unresolvable or invisible issue as a bare reference with no link", () => {
      expect(parseWikiBlocks("{{issue(deadbeef)}}", makeContext())[0]).toEqual({
        kind: "issue",
        label: "#deadbeef",
        href: null,
      });
    });

    it("renders a bare reference when the id is missing", () => {
      expect(parseWikiBlocks("{{issue}}", makeContext())[0]).toEqual({ kind: "issue", label: "#", href: null });
    });
  });

  describe("collectIssueRefs", () => {
    it("collects each distinct reference once", () => {
      expect(collectIssueRefs("{{issue(aaa)}} {{issue(bbb, subject=false)}} {{issue(aaa)}}")).toEqual(["aaa", "bbb"]);
    });

    it("skips escaped macros and other macros", () => {
      expect(collectIssueRefs("!{{issue(aaa)}} {{thumbnail(x.png)}}")).toEqual([]);
    });
  });

  describe("macro_list", () => {
    it("lists every documented macro", () => {
      expect(parseWikiBlocks("{{macro_list}}", makeContext())[0]).toEqual({ kind: "macroList", macros: AVAILABLE_MACROS });
    });
  });

  describe("recent_pages", () => {
    it("defaults to seven days and no limit", () => {
      const seen: { days: number; limit: number | null }[] = [];
      parseWikiBlocks(
        "{{recent_pages}}",
        makeContext({
          recentPages: (options) => {
            seen.push(options);
            return [];
          },
        }),
      );
      expect(seen).toEqual([{ days: 7, limit: null }]);
    });

    it("passes days and limit through", () => {
      const seen: { days: number; limit: number | null }[] = [];
      parseWikiBlocks(
        "{{recent_pages(days=3, limit=5)}}",
        makeContext({
          recentPages: (options) => {
            seen.push(options);
            return [];
          },
        }),
      );
      expect(seen).toEqual([{ days: 3, limit: 5 }]);
    });

    it("sets withTime from the time option", () => {
      expect(parseWikiBlocks("{{recent_pages(time=true)}}", makeContext())[0]).toMatchObject({ withTime: true });
    });

    it("errors on a non-positive days value", () => {
      expect(parseWikiBlocks("{{recent_pages(days=0)}}", makeContext())[0]).toMatchObject({ kind: "error" });
    });
  });
});
