import { describe, expect, it } from "bun:test";
import { LOCALES } from "./locales";
import { translate, type MessageKey } from "./messages";

const KEYS: MessageKey[] = ["nav.projects", "login.submit", "my.title", "projects.title", "projectMenu.issues", "issues.title", "query.column.tracker", "query.operator.!*"];

describe("translate", () => {
  it("returns the Japanese text as it has always been", () => {
    expect(translate("ja", "nav.projects")).toBe("プロジェクト");
  });

  it("returns the English text for en", () => {
    expect(translate("en", "nav.projects")).toBe("Projects");
  });

  it("has a non-empty string for every key in every locale", () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        expect(translate(locale, key).length).toBeGreaterThan(0);
      }
    }
  });
});
