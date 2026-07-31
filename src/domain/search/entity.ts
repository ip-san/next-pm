export type SearchResultType = "issue" | "wiki_page" | "news" | "message";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  excerpt: string;
}
