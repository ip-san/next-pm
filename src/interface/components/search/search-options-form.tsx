import { SEARCH_RESULT_TYPES, type SearchResultType, type SearchScope } from "@/domain/search/entity";
import type { Locale } from "@/domain/i18n/locales";
import { translate, type MessageKey } from "@/domain/i18n/messages";
import type { SearchRequest } from "@/interface/http/search-params";

export const SEARCH_TYPE_KEY: Record<SearchResultType, MessageKey> = {
  issue: "projectMenu.issues",
  wiki_page: "projectMenu.wiki",
  news: "projectMenu.news",
  message: "projectMenu.boards",
};

const SCOPE_KEY: Record<SearchScope, MessageKey> = {
  all: "search.scopeAll",
  my_projects: "search.scopeMine",
  subprojects: "search.scopeSubprojects",
  project: "search.scopeProject",
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
  locale = "ja",
}: {
  request: SearchRequest;
  /** Which scope radios to offer — the global page has no project to scope to. */
  scopes: SearchScope[];
  /** Result counts per type, shown next to each checkbox the way Redmine does. */
  counts: Record<SearchResultType, number>;
  locale?: Locale;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  return (
    <form className="flex flex-col gap-3 text-sm">
      <div className="flex gap-2 max-w-xl">
        <input name="q" defaultValue={request.question} placeholder={t("search.placeholder")} className="border rounded px-3 py-2 flex-1" />
        <button type="submit" className="bg-black text-white rounded px-3 py-2">
          {t("search.submit")}
        </button>
      </div>

      {scopes.length > 1 ? (
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="sr-only">{t("search.scope")}</legend>
          {scopes.map((scope) => (
            <label key={scope} className="flex items-center gap-1">
              <input type="radio" name="scope" value={scope} defaultChecked={request.scope === scope} />
              {t(SCOPE_KEY[scope])}
            </label>
          ))}
        </fieldset>
      ) : null}

      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="sr-only">{t("search.target")}</legend>
        {SEARCH_RESULT_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-1">
            {/* Redmine reads "nothing ticked" as "every type", so an all-ticked form and a
                fresh one submit the same results. */}
            <input type="checkbox" name={type} value="1" defaultChecked={!request.typesExplicit || request.types.includes(type)} />
            {t(SEARCH_TYPE_KEY[type])} ({counts[type]})
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="sr-only">{t("search.options")}</legend>
        <label className="flex items-center gap-1">
          {/* The hidden field is what makes an unticked box submit a value at all, which is
              how Redmine tells "unticked" from "first visit" for a defaulted-on option. */}
          <input type="hidden" name="all_words" value="" />
          <input type="checkbox" name="all_words" value="1" defaultChecked={request.criteria.allWords} />
          {t("search.allWords")}
        </label>
        <label className="flex items-center gap-1">
          <input type="hidden" name="titles_only" value="" />
          <input type="checkbox" name="titles_only" value="1" defaultChecked={request.criteria.titlesOnly} />
          {t("search.titlesOnly")}
        </label>
        <label className="flex items-center gap-1">
          <input type="hidden" name="open_issues" value="" />
          <input type="checkbox" name="open_issues" value="1" defaultChecked={request.openIssues} />
          {t("search.openIssuesOnly")}
        </label>
        <label className="flex items-center gap-1">
          {t("search.attachments")}
          <select name="attachments" defaultValue={request.criteria.attachments} className="border rounded px-2 py-1">
            <option value="0">{t("search.attachmentsNone")}</option>
            <option value="1">{t("search.attachmentsWithDescription")}</option>
            <option value="only">{t("search.attachmentsOnly")}</option>
          </select>
        </label>
      </fieldset>
    </form>
  );
}
