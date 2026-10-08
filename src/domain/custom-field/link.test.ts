import { describe, expect, it } from "bun:test";
import { linkHref } from "./link";

describe("linkHref", () => {
  it("keeps an http or https URL as it is", () => {
    expect(linkHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(linkHref("HTTP://example.com")).toBe("HTTP://example.com");
  });

  it("prefixes a bare host with http://", () => {
    expect(linkHref("example.com/docs")).toBe("http://example.com/docs");
  });

  it("does not let a non-web scheme through as a link", () => {
    expect(linkHref("javascript:alert(1)")).toBe("http://javascript:alert(1)");
    expect(linkHref("data://text/html,x")).toBe("http://data://text/html,x");
  });
});
