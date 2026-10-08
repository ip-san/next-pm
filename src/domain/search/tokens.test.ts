import { describe, expect, it } from "bun:test";
import { MAX_SEARCH_TOKENS, tokenizeSearchQuery } from "./tokens";

describe("tokenizeSearchQuery", () => {
  it("keeps a quoted run as one token", () => {
    expect(tokenizeSearchQuery('hello "bye bye"')).toEqual(["hello", "bye bye"]);
  });

  it("strips the quotes and the spaces just inside them", () => {
    expect(tokenizeSearchQuery('"　foo bar　"')).toEqual(["foo bar"]);
  });

  it("splits on the ideographic space as well as ASCII spaces", () => {
    expect(tokenizeSearchQuery("alpha　beta")).toEqual(["alpha", "beta"]);
  });

  it("does not split on a tab, because Redmine's \\p{Zs} class leaves it alone", () => {
    expect(tokenizeSearchQuery("alpha\tbeta")).toEqual(["alpha\tbeta"]);
  });

  it("drops duplicates and single latin letters", () => {
    expect(tokenizeSearchQuery("bug bug a bug")).toEqual(["bug"]);
  });

  it("keeps a single CJK ideograph", () => {
    expect(tokenizeSearchQuery("検 a")).toEqual(["検"]);
  });

  it("caps the result at five tokens", () => {
    const words = ["one", "two", "three", "four", "five", "six", "seven"];
    expect(tokenizeSearchQuery(words.join(" "))).toEqual(words.slice(0, MAX_SEARCH_TOKENS));
  });

  it("returns nothing for a blank query", () => {
    expect(tokenizeSearchQuery("   ")).toEqual([]);
  });
});
