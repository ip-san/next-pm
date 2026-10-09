import { describe, expect, it } from "bun:test";
import { avatarUrlFor, gravatarUrl, userInitials } from "./avatar";

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

describe("avatarUrlFor", () => {
  it("gives the API a Gravatar URL with no size while the setting is on", () => {
    expect(avatarUrlFor("alice@example.com", true)).toBe("https://www.gravatar.com/avatar/c160f8cc69a4f0bf2b0362752353d060?d=identicon");
  });

  it("gives nothing while the setting is off, so the key is left out of the JSON", () => {
    expect(avatarUrlFor("alice@example.com", false)).toBeUndefined();
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
