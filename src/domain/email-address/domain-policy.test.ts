import { describe, expect, it } from "bun:test";
import { rejectedEmailDomain } from "./domain-policy";

describe("rejectedEmailDomain", () => {
  it("allows every address when neither list is set", () => {
    expect(rejectedEmailDomain("a@example.com", { allowed: "", denied: "" })).toBeNull();
  });

  it("refuses a denied domain, and a subdomain through a leading dot", () => {
    const policy = { allowed: "", denied: "spam.test, .bad.test" };
    expect(rejectedEmailDomain("a@spam.test", policy)).toBe("spam.test");
    expect(rejectedEmailDomain("a@mail.bad.test", policy)).toBe("mail.bad.test");
    expect(rejectedEmailDomain("a@notspam.test", policy)).toBeNull();
  });

  it("refuses anything off the allow list, without case mattering", () => {
    const policy = { allowed: "example.com\n.corp.test", denied: "" };
    expect(rejectedEmailDomain("a@EXAMPLE.com", policy)).toBeNull();
    expect(rejectedEmailDomain("a@eu.corp.test", policy)).toBeNull();
    expect(rejectedEmailDomain("a@other.test", policy)).toBe("other.test");
  });

  it("compares an internationalized domain in Punycode", () => {
    expect(rejectedEmailDomain("a@例え.テスト", { allowed: "xn--r8jz45g.xn--zckzah", denied: "" })).toBeNull();
  });
});
