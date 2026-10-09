"use client";

import { useActionState, useState } from "react";
import {
  copyQueryAction,
  deleteQueryAction,
  saveQueryAction,
  updateQueryAction,
  type SaveQueryActionState,
} from "@/interface/actions/query-actions";
import type { Locale } from "@/domain/i18n/locales";
import { interpolate, translate } from "@/domain/i18n/messages";
import type { QueryOptions, QueryType, QueryVisibility } from "@/domain/query/entity";

const initialState: SaveQueryActionState = { error: null };

export interface SavedQuerySummary {
  id: string;
  name: string;
  visibility: QueryVisibility;
  roleIds: string[];
}

export interface SaveQueryFormProps {
  /** Null on a cross-project list, which saves a global query (Redmine's `query_is_for_all`). */
  projectIdentifier: string | null;
  /** Which list this form belongs to; decides the saved query's STI type and where the action returns to. */
  queryType: QueryType;
  /** The settings currently in effect on the list — what gets stored. */
  options: QueryOptions;
  /** Redmine's `manage_public_queries`: without it the visibility picker isn't even shown. */
  canPublish: boolean;
  /** Redmine's `save_queries`. */
  canSave: boolean;
  roles: { id: string; name: string }[];
  /** When set, the form edits that query instead of creating a new one. */
  editing?: SavedQuerySummary;
  /** The language of the form's own text. */
  locale?: Locale;
}

/** The hidden inputs that carry the list's current settings into every query action. */
function QuerySettingsFields({
  projectIdentifier,
  queryType,
  options,
}: {
  projectIdentifier: string | null;
  queryType: QueryType;
  options: QueryOptions;
}) {
  return (
    <>
      {/* An empty projectIdentifier is how the action reads "global query". */}
      <input type="hidden" name="projectIdentifier" value={projectIdentifier ?? ""} />
      <input type="hidden" name="type" value={queryType} />
      <input type="hidden" name="filters" value={JSON.stringify(options.filters)} />
      <input type="hidden" name="columnNames" value={JSON.stringify(options.columnNames)} />
      <input type="hidden" name="sortCriteria" value={JSON.stringify(options.sortCriteria)} />
      <input type="hidden" name="totalableNames" value={JSON.stringify(options.totalableNames)} />
      <input type="hidden" name="groupBy" value={options.groupBy ?? ""} />
    </>
  );
}

export function SaveQueryForm(props: SaveQueryFormProps) {
  const locale = props.locale ?? "ja";
  const [state, formAction, pending] = useActionState(props.editing ? updateQueryAction : saveQueryAction, initialState);
  const [visibility, setVisibility] = useState<QueryVisibility>(props.editing?.visibility ?? "private");

  if (!props.canSave) return null;

  return (
    <form action={formAction} className="border rounded p-3 flex flex-wrap items-center gap-2 text-sm">
      <QuerySettingsFields projectIdentifier={props.projectIdentifier} queryType={props.queryType} options={props.options} />
      {props.editing ? <input type="hidden" name="queryId" value={props.editing.id} /> : null}

      <label htmlFor="query-name" className="text-gray-500">
        {props.editing ? translate(locale, "query.updateQuery") : translate(locale, "query.saveCurrent")}
      </label>
      <input
        id="query-name"
        name="name"
        required
        defaultValue={props.editing?.name ?? ""}
        placeholder={translate(locale, "query.queryName")}
        className="border rounded px-2 py-1"
      />

      {props.canPublish ? (
        <select
          name="visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as QueryVisibility)}
          aria-label={translate(locale, "query.visibility")}
          className="border rounded px-2 py-1"
        >
          <option value="private">{translate(locale, "query.visibilityPrivate")}</option>
          <option value="roles">{translate(locale, "query.visibilityRoles")}</option>
          <option value="public">{translate(locale, "query.visibilityPublic")}</option>
        </select>
      ) : (
        // Without manage_public_queries the server forces "private" anyway (Redmine's
        // update_query_from_params does the same), so the picker is hidden rather than
        // offered and then rejected.
        <input type="hidden" name="visibility" value="private" />
      )}

      {props.canPublish && visibility === "roles" ? (
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">{translate(locale, "query.roles")}</legend>
          {props.roles.map((role) => (
            <label key={role.id} className="flex items-center gap-1">
              <input type="checkbox" name="roleIds" value={role.id} defaultChecked={props.editing?.roleIds.includes(role.id)} />
              {role.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      <button type="submit" disabled={pending} className="border rounded px-2 py-1 disabled:opacity-50">
        {pending ? translate(locale, "query.saving") : props.editing ? translate(locale, "query.update") : translate(locale, "query.save")}
      </button>
      {state.error ? (
        <span role="alert" className="text-red-600">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** Delete and copy for the saved query currently applied to the list. */
export function SavedQueryControls({
  projectIdentifier,
  queryType,
  query,
  canDelete,
  canCopy,
  locale = "ja",
}: {
  projectIdentifier: string | null;
  queryType: QueryType;
  query: SavedQuerySummary;
  canDelete: boolean;
  canCopy: boolean;
  locale?: Locale;
}) {
  const [deleteState, deleteAction, deletePending] = useActionState(deleteQueryAction, initialState);
  const [copyState, copyAction, copyPending] = useActionState(copyQueryAction, initialState);

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {canCopy ? (
        <form action={copyAction} className="flex items-center gap-2">
          <input type="hidden" name="projectIdentifier" value={projectIdentifier ?? ""} />
          <input type="hidden" name="type" value={queryType} />
          <input type="hidden" name="queryId" value={query.id} />
          <input
            name="name"
            required
            defaultValue={interpolate(translate(locale, "query.copyName"), { name: query.name })}
            aria-label={translate(locale, "query.copyNameAria")}
            className="border rounded px-2 py-1"
          />
          <button type="submit" disabled={copyPending} className="border rounded px-2 py-1 disabled:opacity-50">
            {translate(locale, "query.copy")}
          </button>
        </form>
      ) : null}

      {canDelete ? (
        <form action={deleteAction}>
          <input type="hidden" name="projectIdentifier" value={projectIdentifier ?? ""} />
          <input type="hidden" name="type" value={queryType} />
          <input type="hidden" name="queryId" value={query.id} />
          <button type="submit" disabled={deletePending} className="border rounded px-2 py-1 text-red-600 disabled:opacity-50">
            {translate(locale, "query.deleteQuery")}
          </button>
        </form>
      ) : null}

      {deleteState.error || copyState.error ? (
        <span role="alert" className="text-red-600">
          {deleteState.error ?? copyState.error}
        </span>
      ) : null}
    </div>
  );
}
