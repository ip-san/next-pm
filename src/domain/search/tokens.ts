/** Redmine caps a search at five tokens (`Tokenizer#tokens`'s `.first 5`). */
export const MAX_SEARCH_TOKENS = 5;

/**
 * Port of `Redmine::Search::Tokenizer#tokens` (lib/redmine/search.rb): a quoted run counts as
 * one token, everything else splits on Unicode space separators (`\p{Zs}`, so a tab or a
 * newline does not split), duplicates drop out, and a token must be at least two characters —
 * except a CJK ideograph, where one character is already a word.
 *
 *   hello "bye bye"  ->  ["hello", "bye bye"]
 */
export function tokenizeSearchQuery(question: string): string[] {
  const matches = question.match(/"[^"]+"|[^\p{Zs}]+/gu) ?? [];
  const tokens = matches.map((token) => token.replace(/^"\p{Zs}*|\p{Zs}*"$/gu, ""));
  const unique = [...new Set(tokens)];
  // `\p{Script=Han}` is Redmine's `\p{Han}`: a single kanji is a meaningful query, a single
  // latin letter is not.
  return unique.filter((token) => token.length > 1 || /\p{Script=Han}/u.test(token)).slice(0, MAX_SEARCH_TOKENS);
}
