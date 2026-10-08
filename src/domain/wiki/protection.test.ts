import { describe, expect, it } from "bun:test";
import { isProtectedByDefault, isWikiPageEditable } from "./protection";

describe("isWikiPageEditable", () => {
  it("lets anyone through on an unprotected page", () => {
    expect(isWikiPageEditable({ isProtected: false }, false)).toBe(true);
  });

  it("blocks a protected page without protect_wiki_pages", () => {
    expect(isWikiPageEditable({ isProtected: true }, false)).toBe(false);
  });

  it("allows a protected page with protect_wiki_pages", () => {
    expect(isWikiPageEditable({ isProtected: true }, true)).toBe(true);
  });
});

describe("isProtectedByDefault", () => {
  it("protects the sidebar regardless of case", () => {
    expect(isProtectedByDefault("Sidebar")).toBe(true);
    expect(isProtectedByDefault("sidebar")).toBe(true);
  });

  it("leaves every other title unprotected", () => {
    expect(isProtectedByDefault("Wiki")).toBe(false);
  });
});
