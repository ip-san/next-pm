export interface TocHeading {
  level: number;
  text: string;
  anchor: string;
}

const HEADING_LINE = /^(#{1,6})\s+(.+)$/;

/** Slugifies a heading the same way most Markdown renderers derive an anchor id. */
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

export function extractHeadings(text: string): TocHeading[] {
  const headings: TocHeading[] = [];
  for (const line of text.split("\n")) {
    const match = HEADING_LINE.exec(line);
    if (match) {
      const heading = match[2].trim();
      headings.push({ level: match[1].length, text: heading, anchor: slugify(heading) });
    }
  }
  return headings;
}

export function renderToc(headings: TocHeading[]): string {
  if (headings.length === 0) {
    return "";
  }
  return headings.map((heading) => `${"  ".repeat(heading.level - 1)}- [${heading.text}](#${heading.anchor})`).join("\n");
}

export interface ChildPageRef {
  title: string;
}

export function renderChildPages(children: ChildPageRef[]): string {
  if (children.length === 0) {
    return "";
  }
  return children.map((child) => `- [${child.title}](${child.title})`).join("\n");
}

const MACRO_PATTERN = /\{\{(toc|child_pages|include)(?:\(([^)]*)\))?\}\}/g;

export interface MacroContext {
  /** All headings found in the page's own text — used by {{toc}}. */
  headings: TocHeading[];
  /** Direct children of the current page, keyed by parent title — used by {{child_pages}}. */
  childPages: ChildPageRef[];
  /** Resolves another page's current text by title — used by {{include(title)}}. */
  resolveInclude: (title: string) => string | null;
}

export class CircularIncludeError extends Error {}

/**
 * Expands {{toc}}, {{child_pages}}, and {{include(title)}} macros in wiki text.
 * include() is expanded recursively (an included page's own macros are expanded too),
 * with a visited-set to reject cycles instead of recursing forever.
 */
export function expandMacros(text: string, context: MacroContext, visited: Set<string> = new Set()): string {
  return text.replace(MACRO_PATTERN, (_match, name: string, arg: string | undefined) => {
    if (name === "toc") {
      return renderToc(context.headings);
    }
    if (name === "child_pages") {
      return renderChildPages(context.childPages);
    }
    if (name === "include") {
      const title = (arg ?? "").trim();
      if (title.length === 0) {
        return "";
      }
      if (visited.has(title)) {
        throw new CircularIncludeError(`{{include(${title})}} forms a cycle.`);
      }
      const included = context.resolveInclude(title);
      if (included === null) {
        return `[[${title}]]`;
      }
      const nextVisited = new Set(visited);
      nextVisited.add(title);
      return expandMacros(included, { ...context, headings: extractHeadings(included) }, nextVisited);
    }
    return _match;
  });
}
