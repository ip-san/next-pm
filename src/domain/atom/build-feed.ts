export interface AtomFeedEntry {
  /** Must be a stable, globally-unique URI — reused verbatim as <id>, never re-derived from mutable fields. */
  id: string;
  title: string;
  link: string;
  updatedAt: Date;
  authorName: string | null;
  summary: string;
}

export interface AtomFeedOptions {
  id: string;
  title: string;
  selfUrl: string;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function entryXml(entry: AtomFeedEntry): string {
  return [
    "  <entry>",
    `    <id>${escapeXml(entry.id)}</id>`,
    `    <title>${escapeXml(entry.title)}</title>`,
    `    <link href="${escapeXml(entry.link)}"/>`,
    `    <updated>${entry.updatedAt.toISOString()}</updated>`,
    entry.authorName ? `    <author><name>${escapeXml(entry.authorName)}</name></author>` : null,
    `    <summary>${escapeXml(entry.summary)}</summary>`,
    "  </entry>",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Mirrors Redmine's common/feed.atom.builder (Atom 1.0, RFC 4287). The feed's own <updated> is
 * the newest entry's timestamp, matching Redmine's @items.first.event_datetime after items are
 * sorted descending — or the epoch when there are no entries, since an empty feed still needs a
 * valid <updated> value and there's no meaningful "latest change" to report.
 */
export function buildAtomFeed(options: AtomFeedOptions, entries: AtomFeedEntry[]): string {
  const feedUpdatedAt = entries.length > 0 ? entries[0].updatedAt : new Date(0);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(options.id)}</id>`,
    `  <title>${escapeXml(options.title)}</title>`,
    `  <updated>${feedUpdatedAt.toISOString()}</updated>`,
    `  <link rel="self" href="${escapeXml(options.selfUrl)}"/>`,
    ...entries.map(entryXml),
    "</feed>",
  ].join("\n");
}
