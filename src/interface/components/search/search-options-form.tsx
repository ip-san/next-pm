import { SEARCH_RESULT_TYPES, type SearchResultType, type SearchScope } from "@/domain/search/entity";
import type { SearchRequest } from "@/interface/http/search-params";

export const SEARCH_TYPE_LABEL: Record<SearchResultType, string> = {
  issue: "チケット",
  wiki_page: "Wiki",
  news: "ニュース",
  message: "フォーラム",
};

const SCOPE_LABEL: Record<SearchScope, string> = {
  all: "全プロジェクト",
  my_projects: "自分のプロジェクト",
  subprojects: "このプロジェクトとサブプロジェクト",
  project: "このプロジェクトのみ",
};

/**
 * `app/views/search/index.html.erb`'s option block. A plain GET form, so every option ends
 * up in the URL and a result page stays linkable and bookmarkable — the same contract the
 * REST search route reads.
 */
export function SearchOptionsForm({
  request,
  scopes,
  counts,
}: {
  request: SearchRequest;
  /** Which scope radios to offer — the global page has no project to scope to. */
  scopes: SearchScope[];
  /** Result counts per type, shown next to each checkbox the way Redmine does. */
  counts: Record<SearchResultType, number>;
}) {
  return (
    <form className="flex flex-col gap-3 text-sm">
      <div className="flex gap-2 max-w-xl">
        <input name="q" defaultValue={request.question} placeholder="検索語" className="border rounded px-3 py-2 flex-1" />
        <button type="submit" className="bg-black text-white rounded px-3 py-2">
          検索
        </button>
      </div>

      {scopes.length > 1 ? (
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">検索範囲</legend>
          {scopes.map((scope) => (
            <label key={scope} className="flex items-center gap-1">
              <input type="radio" name="scope" value={scope} defaultChecked={request.scope === scope} />
              {SCOPE_LABEL[scope]}
            </label>
          ))}
        </fieldset>
      ) : null}

      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="sr-only">対象</legend>
        {SEARCH_RESULT_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-1">
            {/* Redmine reads "nothing ticked" as "every type", so an all-ticked form and a
                fresh one submit the same results. */}
            <input type="checkbox" name={type} value="1" defaultChecked={!request.typesExplicit || request.types.includes(type)} />
            {SEARCH_TYPE_LABEL[type]} ({counts[type]})
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="sr-only">オプション</legend>
        <label className="flex items-center gap-1">
          {/* The hidden field is what makes an unticked box submit a value at all, which is
              how Redmine tells "unticked" from "first visit" for a defaulted-on option. */}
          <input type="hidden" name="all_words" value="" />
          <input type="checkbox" name="all_words" value="1" defaultChecked={request.criteria.allWords} />
          すべての単語を含む
        </label>
        <label className="flex items-center gap-1">
          <input type="hidden" name="titles_only" value="" />
          <input type="checkbox" name="titles_only" value="1" defaultChecked={request.criteria.titlesOnly} />
          タイトルのみ
        </label>
        <label className="flex items-center gap-1">
          <input type="hidden" name="open_issues" value="" />
          <input type="checkbox" name="open_issues" value="1" defaultChecked={request.openIssues} />
          未完了のチケットのみ
        </label>
        <label className="flex items-center gap-1">
          添付ファイル:
          <select name="attachments" defaultValue={request.criteria.attachments} className="border rounded px-2 py-1">
            <option value="0">検索しない</option>
            <option value="1">説明と一緒に検索</option>
            <option value="only">添付ファイルのみ</option>
          </select>
        </label>
      </fieldset>
    </form>
  );
}
