import { describe, expect, it } from "bun:test";
import { gravatarUrl, userInitials } from "./avatar";

describe("gravatarUrl", () => {
  // The canonical example from Gravatar's own documentation.
  it("hashes the lowercased, trimmed address the way Gravatar specifies", () => {
    expect(gravatarUrl("MyEmailAddress@example.com ", 40)).toContain("0bc83cb571cd1c50ba6f3e8a78ef1346");
  });

  it("normalises case and surrounding whitespace to the same hash", () => {
    expect(gravatarUrl(" alice@example.com", 40)).toBe(gravatarUrl("Alice@Example.COM", 40));
  });

  it("asks for the requested size and an identicon fallback", () => {
    expect(gravatarUrl("alice@example.com", 64)).toContain("s=64");
    expect(gravatarUrl("alice@example.com", 64)).toContain("d=identicon");
  });
});

describe("userInitials", () => {
  it("puts the family name first, matching how next-pm renders names", () => {
    expect(userInitials("Alice", "Smith")).toBe("SA");
  });

  it("copes with a missing given name", () => {
    expect(userInitials("", "Smith")).toBe("S");
  });
});
