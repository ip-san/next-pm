import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { ERROR_MESSAGES_EN, localizeMessage } from "./error-messages";

const JAPANESE = /[ぁ-んァ-ヶ一-龥]/;

/** The layers whose messages reach the screen or the API as errors or results. */
const ROOTS = ["src/interface/actions", "src/application", "src/domain"];

/**
 * Japanese text in those layers that is not a message for the reader, with the reason it stays.
 * A directory entry ends in "/".
 */
const NOT_MESSAGES: Record<string, string> = {
  "src/domain/i18n/": "the catalogs themselves",
  "src/domain/mail/keywords.ts": "keywords read from incoming mail, which Redmine also accepts in the configured language",
  "src/domain/wiki/macro-blocks.ts": "wiki macro output, written into the page body",
  "src/domain/notification/mail-notification.ts": "option labels, translated where they are shown (my.mailNotification.*)",
  "src/domain/webhook/events.ts": "event labels, translated where they are shown (webhooks.event.*)",
  "src/domain/query/columns.ts": "column names, translated where they are shown (interface/query/column-labels.ts)",
  "src/domain/query/time-entry-columns.ts": "column names, translated where they are shown (interface/query/column-labels.ts)",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function isExempt(path: string): boolean {
  return Object.keys(NOT_MESSAGES).some((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
}

/** Every Japanese string or template literal, with each `${…}` written as {0}, {1}, … like the table's templates. */
function japaneseLiterals(): { text: string; file: string }[] {
  const found: { text: string; file: string }[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const path = relative(process.cwd(), file);
      if (isExempt(path)) continue;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        let text: string | null = null;
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
        else if (ts.isTemplateExpression(node)) {
          text = node.head.text + node.templateSpans.map((span, index) => `{${index}}${span.literal.text}`).join("");
        }
        if (text !== null && JAPANESE.test(text)) found.push({ text, file: path });
        // A template's own text is recorded above; the expressions inside its ${…} can hold messages of their own.
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return;
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return found;
}

describe("ERROR_MESSAGES_EN", () => {
  it("has English for every Japanese message the server can produce", () => {
    const missing = japaneseLiterals().filter(({ text }) => !(text in ERROR_MESSAGES_EN));
    expect(missing).toEqual([]);
  });

  it("has no English left in Japanese and no placeholder the Japanese doesn't have", () => {
    for (const [japanese, english] of Object.entries(ERROR_MESSAGES_EN)) {
      expect(JAPANESE.test(english)).toBe(false);
      const placeholders = (text: string) => [...text.matchAll(/\{(\d+)\}/g)].map((match) => match[1]).sort();
      expect({ japanese, placeholders: placeholders(english) }).toEqual({ japanese, placeholders: placeholders(japanese) });
    }
  });
});

describe("localizeMessage", () => {
  it("returns Japanese unchanged", () => {
    expect(localizeMessage("ja", "チケットが見つかりません。")).toBe("チケットが見つかりません。");
  });

  it("translates a fixed message and a template with its values", () => {
    expect(localizeMessage("en", "チケットが見つかりません。")).toBe("The issue was not found.");
    expect(localizeMessage("en", "12行目: トラッカー「Bug」が見つかりません。")).toBe('Row 12: tracker "Bug" was not found.');
  });

  it("translates a value that is itself a message, and each sentence of a joined message", () => {
    expect(localizeMessage("en", "3行目: 作業分類が不正です。")).toBe("Row 3: Activity is not valid.");
    expect(localizeMessage("en", "パスワードは8文字以上で入力してください。 パスワードには大文字・数字を含めてください。")).toBe(
      "Password must be at least 8 characters. Password must contain uppercase letters, digits.",
    );
  });

  it("leaves text it doesn't know unchanged, so translating twice is harmless", () => {
    expect(localizeMessage("en", "The issue was not found.")).toBe("The issue was not found.");
    expect(localizeMessage("en", localizeMessage("en", "ログインしてください。"))).toBe("Sign in first.");
  });

  it("takes linear time on long input that almost matches a template", () => {
    const long = "1行目: " + "「".repeat(200_000) + "x";
    const started = performance.now();
    localizeMessage("en", long);
    localizeMessage("en", "{0}".repeat(50_000));
    expect(performance.now() - started).toBeLessThan(500);
  });
});
