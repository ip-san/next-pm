import { describe, expect, it } from "bun:test";
import { unionRecipients } from "./recipients";

describe("unionRecipients", () => {
  it("unions groups and dedupes", () => {
    expect(unionRecipients([["a", "b"], ["b", "c"]], null).sort()).toEqual(["a", "b", "c"]);
  });

  it("drops null/undefined entries", () => {
    expect(unionRecipients([["a", null], [undefined, "b"]], null).sort()).toEqual(["a", "b"]);
  });

  it("excludes the acting user", () => {
    expect(unionRecipients([["a", "b", "c"]], "b").sort()).toEqual(["a", "c"]);
  });

  it("returns an empty array when everything is excluded or empty", () => {
    expect(unionRecipients([[], [null]], "a")).toEqual([]);
  });
});
