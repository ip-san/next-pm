/**
 * The second half of wiki macro expansion. domain/wiki/macros.ts handles the macros whose
 * output is just more wiki text ({{toc}}, {{child_pages}}, {{include}}); this pass handles the
 * ones that render as markup — a collapsible block, an image, a link — by turning the text
 * into a list of blocks the interface layer renders as JSX. Keeping it to data means the
 * renderer never has to inject HTML built from page content.
 */

export interface MacroDescription {
  name: string;
  description: string;
}

/** Mirrors the `desc` strings Redmine registers next to each macro; used by {{macro_list}}. */
export const AVAILABLE_MACROS: MacroDescription[] = [
  { name: "child_pages", description: "現在のページの子ページの一覧を表示します。" },
  { name: "collapse", description: "既定で折りたたまれたテキストブロックを挿入します。例: {{collapse(詳細を表示)\n本文\n}}" },
  { name: "include", description: "他の Wiki ページを取り込みます。例: {{include(ページ名)}}" },
  { name: "issue", description: "チケットへのリンクを表示します。例: {{issue(eb0b2d1a)}}、{{issue(eb0b2d1a, subject=false)}}" },
  { name: "macro_list", description: "利用できるマクロの一覧を表示します。" },
  { name: "recent_pages", description: "最近更新された Wiki ページを表示します。例: {{recent_pages(days=3)}}、{{recent_pages(limit=5)}}" },
  { name: "thumbnail", description: "添付画像のサムネイルを表示します。例: {{thumbnail(image.png)}}、{{thumbnail(image.png, size=300)}}" },
  { name: "toc", description: "ページ内の見出しから目次を作ります。" },
];

export type WikiBlock =
  | { kind: "text"; text: string }
  | { kind: "collapse"; showLabel: string; hideLabel: string; body: string }
  | { kind: "thumbnail"; attachmentId: string; filename: string; size: number; title: string }
  /** `href` is null when the issue doesn't resolve or the viewer may not see it. */
  | { kind: "issue"; label: string; href: string | null }
  | { kind: "macroList"; macros: MacroDescription[] }
  | { kind: "recentPages"; pages: RecentPage[]; withTime: boolean }
  | { kind: "error"; message: string };

export interface RecentPage {
  title: string;
  updatedAt: Date;
}

export interface ResolvedIssue {
  id: string;
  idPrefix: string;
  trackerName: string;
  subject: string;
  projectName: string;
  projectIdentifier: string;
}

export interface MacroBlockContext {
  /** The rendered page's own attachments — Redmine's `container.attachments`, nothing wider. */
  findAttachment: (filename: string) => { id: string; filename: string } | null;
  /** Must return null for an issue the viewer may not see, so the macro falls back to a bare #id. */
  resolveIssue: (idPrefix: string) => ResolvedIssue | null;
  /** Already filtered to wikis the viewer can read. */
  recentPages: (options: { days: number; limit: number | null }) => RecentPage[];
}

/** Redmine's MACROS_RE (application_helper.rb#L1446). */
const MACRO_RE = /(!)?\{\{(\w+)(?:\(([^\n\r]*?)\))?([\n\r][\s\S]*?[\n\r])?\}\}/g;

const RENDERED_MACROS = new Set(["collapse", "thumbnail", "issue", "macro_list", "recent_pages"]);

/**
 * Splits `args` on commas that are not inside double quotes and unquotes each piece —
 * Redmine's `exec_macro` argument splitting.
 */
function splitMacroArgs(raw: string): string[] {
  if (raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(/\s*,\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((arg) => arg.replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));
}

/**
 * Redmine's `extract_macro_options`: trailing `key=value` arguments whose key is recognized
 * are pulled off the end into options, and anything before them stays a positional argument.
 */
function extractMacroOptions(args: string[], keys: string[]): { args: string[]; options: Record<string, string> } {
  const positional = [...args];
  const options: Record<string, string> = {};
  for (;;) {
    const last = positional[positional.length - 1];
    const match = last === undefined ? null : /^(.+?)=(.+)$/.exec(last.trim());
    if (!match || !keys.includes(match[1].toLowerCase())) {
      return { args: positional, options };
    }
    options[match[1].toLowerCase()] = match[2].replace(/^"(.*)"$/, "$1");
    positional.pop();
  }
}

function booleanOption(options: Record<string, string>, key: string, fallback: boolean): boolean {
  const raw = options[key];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

/**
 * Every issue referenced by an {{issue(...)}} macro in `text`, so the caller can resolve them
 * all before the synchronous parse runs. Escaped macros are skipped, since they never render.
 */
export function collectIssueRefs(text: string): string[] {
  const refs = new Set<string>();
  MACRO_RE.lastIndex = 0;
  for (let match = MACRO_RE.exec(text); match !== null; match = MACRO_RE.exec(text)) {
    const [, escaped, rawName, rawArgs] = match;
    if (escaped || rawName.toLowerCase() !== "issue") {
      continue;
    }
    const { args } = extractMacroOptions(splitMacroArgs(rawArgs ?? ""), ["project", "subject", "tracker"]);
    const idPrefix = args[0]?.trim();
    if (idPrefix) {
      refs.add(idPrefix);
    }
  }
  return [...refs];
}

/**
 * Turns wiki text into renderable blocks. Everything that is not one of the rendering macros —
 * including an unknown `{{name}}` and an escaped `!{{name}}` — is carried through as text, the
 * way Redmine leaves unrecognized macros in place.
 */
export function parseWikiBlocks(text: string, context: MacroBlockContext): WikiBlock[] {
  const blocks: WikiBlock[] = [];
  let cursor = 0;

  const pushText = (value: string) => {
    if (value.length === 0) return;
    const last = blocks[blocks.length - 1];
    if (last?.kind === "text") {
      last.text += value;
    } else {
      blocks.push({ kind: "text", text: value });
    }
  };

  MACRO_RE.lastIndex = 0;
  for (let match = MACRO_RE.exec(text); match !== null; match = MACRO_RE.exec(text)) {
    const [whole, escaped, rawName, rawArgs, rawBody] = match;
    const name = rawName.toLowerCase();
    if (!RENDERED_MACROS.has(name)) {
      continue;
    }

    pushText(text.slice(cursor, match.index));
    cursor = match.index + whole.length;

    if (escaped) {
      // Redmine's leading "!" escapes the macro: the literal text is shown, minus the "!".
      pushText(whole.slice(1));
      continue;
    }

    blocks.push(buildBlock(name, splitMacroArgs(rawArgs ?? ""), rawBody ?? null, context));
  }
  pushText(text.slice(cursor));

  return blocks;
}

function buildBlock(
  name: string,
  rawArgs: string[],
  rawBody: string | null,
  context: MacroBlockContext,
): WikiBlock {
  if (name === "collapse") {
    // Redmine: args[0] is the "show" label, args[1] the "hide" label, each falling back.
    const showLabel = rawArgs[0]?.trim() || "表示";
    return {
      kind: "collapse",
      showLabel,
      hideLabel: rawArgs[1]?.trim() || showLabel,
      body: (rawBody ?? "").replace(/^[\n\r]+/, "").replace(/[\n\r]+$/, ""),
    };
  }

  if (name === "macro_list") {
    return { kind: "macroList", macros: AVAILABLE_MACROS };
  }

  if (name === "thumbnail") {
    const { args, options } = extractMacroOptions(rawArgs, ["size", "title"]);
    const filename = args[0]?.trim() ?? "";
    if (filename.length === 0) {
      return { kind: "error", message: "ファイル名を指定してください。" };
    }
    const rawSize = options.size;
    if (rawSize !== undefined && !/^\d+$/.test(rawSize)) {
      return { kind: "error", message: "size には数値を指定してください。" };
    }
    const parsedSize = Number(rawSize ?? 0);
    const attachment = context.findAttachment(filename);
    if (!attachment) {
      return { kind: "error", message: `添付ファイル ${filename} が見つかりません。` };
    }
    return {
      kind: "thumbnail",
      attachmentId: attachment.id,
      filename: attachment.filename,
      size: parsedSize > 0 ? parsedSize : 200,
      title: options.title ?? attachment.filename,
    };
  }

  if (name === "issue") {
    const { args, options } = extractMacroOptions(rawArgs, ["project", "subject", "tracker"]);
    const idPrefix = args[0]?.trim() ?? "";
    const issue = idPrefix.length > 0 ? context.resolveIssue(idPrefix) : null;
    if (!issue) {
      // Redmine falls back to the plain reference so the text still shows something was meant.
      return { kind: "issue", label: `#${idPrefix}`, href: null };
    }
    const parts: string[] = [];
    if (booleanOption(options, "project", false)) {
      parts.push(`${issue.projectName} - `);
    }
    if (booleanOption(options, "tracker", true)) {
      parts.push(`${issue.trackerName} `);
    }
    parts.push(`#${issue.idPrefix}`);
    if (booleanOption(options, "subject", true)) {
      parts.push(`: ${issue.subject}`);
    }
    return {
      kind: "issue",
      label: parts.join(""),
      href: `/projects/${issue.projectIdentifier}/issues/${issue.id}`,
    };
  }

  // recent_pages
  const { options } = extractMacroOptions(rawArgs, ["days", "limit", "time", "project", "include_subprojects"]);
  const days = Number(options.days ?? 7);
  if (!Number.isInteger(days) || days <= 0) {
    return { kind: "error", message: "days には正の整数を指定してください。" };
  }
  const limit = options.limit === undefined ? null : Number(options.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    return { kind: "error", message: "limit には正の整数を指定してください。" };
  }
  return {
    kind: "recentPages",
    pages: context.recentPages({ days, limit }),
    withTime: options.time === "true",
  };
}
