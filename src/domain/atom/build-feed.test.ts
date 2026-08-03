import { describe, expect, it } from "bun:test";
import { buildAtomFeed } from "./build-feed";

const baseOptions = { id: "urn:next-pm:activity:proj-1", title: "Root Project Activity", selfUrl: "https://example.com/feed" };

describe("buildAtomFeed", () => {
  it("produces well-formed XML with the feed-level fields", () => {
    const xml = buildAtomFeed(baseOptions, []);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain("<id>urn:next-pm:activity:proj-1</id>");
    expect(xml).toContain("<title>Root Project Activity</title>");
    expect(xml).toContain('<link rel="self" href="https://example.com/feed"/>');
    expect(xml.trim().endsWith("</feed>")).toBe(true);
  });

  it("uses the epoch as <updated> for an empty feed", () => {
    const xml = buildAtomFeed(baseOptions, []);
    expect(xml).toContain(`<updated>${new Date(0).toISOString()}</updated>`);
  });

  it("uses the first (newest) entry's timestamp as the feed-level <updated>", () => {
    const xml = buildAtomFeed(baseOptions, [
      { id: "tag:1", title: "Newest", link: "https://example.com/1", updatedAt: new Date("2026-08-02T00:00:00Z"), authorName: null, summary: "" },
      { id: "tag:2", title: "Older", link: "https://example.com/2", updatedAt: new Date("2026-08-01T00:00:00Z"), authorName: null, summary: "" },
    ]);
    const feedUpdated = xml.match(/^  <updated>(.+)<\/updated>$/m)?.[1];
    expect(feedUpdated).toBe("2026-08-02T00:00:00.000Z");
  });

  it("renders one <entry> per item with title/link/updated/summary", () => {
    const xml = buildAtomFeed(baseOptions, [
      {
        id: "tag:next-pm,2026:issue-1",
        title: "Something broke",
        link: "https://example.com/issues/1",
        updatedAt: new Date("2026-08-01T12:00:00Z"),
        authorName: "Alice Doe",
        summary: "It broke.",
      },
    ]);
    expect(xml).toContain("<id>tag:next-pm,2026:issue-1</id>");
    expect(xml).toContain("<title>Something broke</title>");
    expect(xml).toContain('<link href="https://example.com/issues/1"/>');
    expect(xml).toContain("<updated>2026-08-01T12:00:00.000Z</updated>");
    expect(xml).toContain("<author><name>Alice Doe</name></author>");
    expect(xml).toContain("<summary>It broke.</summary>");
  });

  it("omits the <author> element when authorName is null", () => {
    const xml = buildAtomFeed(baseOptions, [
      { id: "tag:1", title: "T", link: "https://example.com/1", updatedAt: new Date(), authorName: null, summary: "" },
    ]);
    expect(xml).not.toContain("<author>");
  });

  it("escapes XML-special characters in every text field", () => {
    const xml = buildAtomFeed(
      { id: 'id & "quotes"', title: "Title <script>alert(1)</script>", selfUrl: "https://example.com/?a=1&b=2" },
      [
        {
          id: "tag:1",
          title: "<b>bold</b> & 'quoted'",
          link: 'https://example.com/1?x="y"',
          updatedAt: new Date("2026-08-01T00:00:00Z"),
          authorName: "O'Brien & Co",
          summary: 'Summary with <tags> & "quotes"',
        },
      ],
    );
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(xml).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; &apos;quoted&apos;");
    expect(xml).toContain("O&apos;Brien &amp; Co");
    expect(xml).toContain("Summary with &lt;tags&gt; &amp; &quot;quotes&quot;");
    expect(xml).toContain('href="https://example.com/1?x=&quot;y&quot;"');
    expect(xml).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(xml).toContain("<id>id &amp; &quot;quotes&quot;</id>");
  });
});
