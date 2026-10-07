import { describe, expect, it } from "bun:test";
import { nextProjectIdentifier, succIdentifier } from "./next-identifier";

describe("succIdentifier", () => {
  // These four agree with Ruby's String#succ, which is what Redmine calls.
  it("increments a trailing number", () => {
    expect(succIdentifier("project-1")).toBe("project-2");
    expect(succIdentifier("project-9")).toBe("project-10");
    expect(succIdentifier("project-99")).toBe("project-100");
  });

  it("keeps zero padding until the number outgrows it", () => {
    expect(succIdentifier("project-09")).toBe("project-10");
    expect(succIdentifier("project-001")).toBe("project-002");
  });

  it("appends a counter when there is no trailing number, rather than mangling the word", () => {
    // Ruby's String#succ would say "myprojecu"; see the module comment.
    expect(succIdentifier("myproject")).toBe("myproject-1");
  });
});

describe("nextProjectIdentifier", () => {
  it("returns null when there is no project to follow", () => {
    expect(nextProjectIdentifier([])).toBeNull();
  });

  it("succeeds the greatest identifier", () => {
    expect(nextProjectIdentifier(["alpha", "project-1", "project-2"])).toBe("project-3");
  });
});
